import { Test, TestingModule } from '@nestjs/testing';
import { RmqContext } from '@nestjs/microservices';
import { PaymentStatus } from '@lib/prisma';
import {
  constants,
  type PaymentRequestedEvent,
} from '../../../libs/contracts/src/payment-events';
import { NonRetryableError } from '../../../libs/contracts/src/processing-errors';
import { PaymentEventsController } from './payments-events.controller';
import { PaymentWorkerService } from './payment-worker.service';

describe('PaymentEventsController (retry/DLQ)', () => {
  let controller: PaymentEventsController;

  // O processor é a única dependência do controller. O mock permite escolher
  // sucesso ou classe de falha sem executar Prisma e sem consumir fila real.
  const paymentWorkerMock = {
    processRequestedPayment: jest.fn(),
  };

  // Channel representa as operações AMQP observadas pelo handler: ACK confirma,
  // NACK sem requeue estaciona na DLQ, sendToQueue agenda retry com TTL.
  const channelMock = {
    ack: jest.fn(),
    nack: jest.fn(),
    sendToQueue: jest.fn(),
  };

  function messageFixture(
    headers: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      fields: {},
      properties: { headers },
      content: Buffer.from('payment-requested-envelope'),
    };
  }

  function contextWith(message: Record<string, unknown>): RmqContext {
    return {
      getChannelRef: () => channelMock,
      getMessage: () => message,
    } as unknown as RmqContext;
  }

  const eventFixture: PaymentRequestedEvent = {
    eventId: 'evt-routing-1',
    eventType: constants.paymentRequested,
    occurredAt: new Date().toISOString(),
    correlationId: 'corr-routing-1',
    payload: { paymentId: 30, orderId: 8, userId: 7, amount: '26' },
  };

  function deathHistory(count: number): Array<Record<string, unknown>> {
    return [
      {
        count,
        queue: constants.paymentRequestedRetryQueue,
        reason: 'expired',
      },
    ];
  }

  beforeEach(async () => {
    // Limpa histórico e respostas para os sinais AMQP não vazarem entre casos.
    jest.resetAllMocks();

    // O código de produção registra logs. Silenciamos apenas a saída durante o
    // teste; o `afterEach` abaixo restaura os métodos depois de cada caso.
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentEventsController],
      providers: [
        {
          provide: PaymentWorkerService,
          useValue: paymentWorkerMock,
        },
      ],
    }).compile();

    controller = module.get<PaymentEventsController>(PaymentEventsController);
  });

  afterEach(() => {
    // Console é estado global, portanto precisa voltar à implementação original.
    jest.restoreAllMocks();
  });

  it('envia ACK depois que o PaymentProcessor conclui com sucesso', async () => {
    // Arrange: o processor resolve um pagamento aprovado.
    paymentWorkerMock.processRequestedPayment.mockResolvedValue({
      id: 30,
      status: PaymentStatus.APPROVED,
    });
    const message = messageFixture();

    // Act: entregamos evento e contexto ao handler público do consumer.
    await controller.handlePaymentRequested(eventFixture, contextWith(message));

    // Assert: o ID correto é processado e a mensagem é confirmada uma vez.
    expect(paymentWorkerMock.processRequestedPayment).toHaveBeenCalledWith(30);
    expect(channelMock.ack).toHaveBeenCalledWith(message);
    expect(channelMock.nack).not.toHaveBeenCalled();
    expect(channelMock.sendToQueue).not.toHaveBeenCalled();
  });

  it('republica na retry queue e confirma a original em falha temporária na primeira entrega', async () => {
    // Arrange: erro temporário sem histórico de x-death (tentativa 1).
    paymentWorkerMock.processRequestedPayment.mockRejectedValue(
      new Error('connection reset'),
    );
    const message = messageFixture({ 'x-marker': 'keep' });

    // Act: o handler deve agendar retry em vez de estacionar na DLQ.
    await controller.handlePaymentRequested(eventFixture, contextWith(message));

    // Assert: conteúdo e cabeçalhos republicados intactos; original confirmada.
    expect(channelMock.sendToQueue).toHaveBeenCalledWith(
      constants.paymentRequestedRetryQueue,
      message.content,
      expect.objectContaining({ headers: { 'x-marker': 'keep' } }),
    );
    expect(channelMock.ack).toHaveBeenCalledWith(message);
    expect(channelMock.nack).not.toHaveBeenCalled();
  });

  it('mantém o histórico de x-death ao republicar para a contagem de tentativas sobreviver', async () => {
    // Arrange: segunda tentativa carrega o x-death da expiração anterior.
    paymentWorkerMock.processRequestedPayment.mockRejectedValue(
      new Error('database timeout'),
    );
    const deaths = deathHistory(1);
    const message = messageFixture({ 'x-death': deaths });

    // Act: falha temporária com tentativas restantes volta para retry.
    await controller.handlePaymentRequested(eventFixture, contextWith(message));

    // Assert: o x-death é preservado para o broker incrementar na próxima expiração.
    expect(channelMock.sendToQueue).toHaveBeenCalledWith(
      constants.paymentRequestedRetryQueue,
      message.content,
      expect.objectContaining({ headers: { 'x-death': deaths } }),
    );
    expect(channelMock.ack).toHaveBeenCalledWith(message);
    expect(channelMock.nack).not.toHaveBeenCalled();
  });

  it('estaciona na DLQ quando a tentativa atinge MAX_RETRIES', async () => {
    // Arrange: duas expirações anteriores + falha atual = tentativa 3 = limite padrão.
    paymentWorkerMock.processRequestedPayment.mockRejectedValue(
      new Error('connection reset'),
    );
    const message = messageFixture({ 'x-death': deathHistory(2) });

    // Act: sem tentativas restantes, a mensagem não pode voltar para retry.
    await controller.handlePaymentRequested(eventFixture, contextWith(message));

    // Assert: NACK sem requeue (a DLX da fila principal roteia para a DLQ).
    expect(channelMock.nack).toHaveBeenCalledWith(message, false, false);
    expect(channelMock.ack).not.toHaveBeenCalled();
    expect(channelMock.sendToQueue).not.toHaveBeenCalled();
  });

  it('estaciona erro permanente na DLQ já na primeira entrega', async () => {
    // Arrange: pagamento inexistente nunca será resolvido por retry.
    paymentWorkerMock.processRequestedPayment.mockRejectedValue(
      new NonRetryableError('Payment not found'),
    );
    const message = messageFixture();

    // Act: erro permanente pula a retry queue em qualquer tentativa.
    await controller.handlePaymentRequested(eventFixture, contextWith(message));

    // Assert: vai direto para a DLQ sem republicação.
    expect(channelMock.nack).toHaveBeenCalledWith(message, false, false);
    expect(channelMock.ack).not.toHaveBeenCalled();
    expect(channelMock.sendToQueue).not.toHaveBeenCalled();
  });

  it('respeita MAX_RETRIES configurado via ambiente', async () => {
    // Arrange: com limite 1, até a primeira falha temporária vai para a DLQ.
    process.env.MAX_RETRIES = '1';
    paymentWorkerMock.processRequestedPayment.mockRejectedValue(
      new Error('connection reset'),
    );
    const message = messageFixture();

    try {
      // Act: primeira entrega já esgota o limite configurado.
      await controller.handlePaymentRequested(
        eventFixture,
        contextWith(message),
      );
    } finally {
      delete process.env.MAX_RETRIES;
    }

    // Assert: DLQ imediata sem passar pela retry queue.
    expect(channelMock.nack).toHaveBeenCalledWith(message, false, false);
    expect(channelMock.sendToQueue).not.toHaveBeenCalled();
  });

  it('trata x-death malformado como primeira entrega', async () => {
    // Arrange: cabeçalho inesperado não pode quebrar a contagem de tentativas.
    paymentWorkerMock.processRequestedPayment.mockRejectedValue(
      new Error('connection reset'),
    );
    const message = messageFixture({ 'x-death': 'not-an-array' });

    // Act: sem histórico legível, a entrega conta como tentativa 1.
    await controller.handlePaymentRequested(eventFixture, contextWith(message));

    // Assert: falha temporária na tentativa 1 agenda retry normalmente.
    expect(channelMock.sendToQueue).toHaveBeenCalledWith(
      constants.paymentRequestedRetryQueue,
      message.content,
      expect.objectContaining({
        headers: { 'x-death': 'not-an-array' },
      }),
    );
    expect(channelMock.ack).toHaveBeenCalledWith(message);
    expect(channelMock.nack).not.toHaveBeenCalled();
  });
});
