import { Test, TestingModule } from '@nestjs/testing';
import { RmqContext } from '@nestjs/microservices';
import { PaymentStatus } from '@lib/prisma';
import type { PaymentRequestedEvent } from '../../../libs/contracts/src/payment-events';
import { PaymentEventsController } from './payments-events.controller';
import { PaymentWorkerService } from './payment-worker.service';

describe('PaymentEventsController (ACK/NACK)', () => {
  let controller: PaymentEventsController;

  // O processor é a única dependência do controller. O mock permite escolher
  // sucesso ou falha sem executar Prisma e sem consumir uma fila real.
  const paymentWorkerMock = {
    processRequestedPayment: jest.fn(),
  };

  // Channel e mensagem representam apenas as operações AMQP observadas pelo
  // handler: ACK confirma sucesso; NACK rejeita e decide se haverá requeue.
  const channelMock = {
    ack: jest.fn(),
    nack: jest.fn(),
  };
  const messageFixture = {
    fields: {},
    properties: {},
    content: Buffer.from('payment-requested'),
  };
  const contextMock = {
    getChannelRef: () => channelMock,
    getMessage: () => messageFixture,
  } as unknown as RmqContext;

  const eventFixture: PaymentRequestedEvent = {
    paymentId: 30,
    orderId: 8,
    userId: 7,
    amount: '26',
  };

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

    // Act: entregamos evento e contexto ao handler público do consumer.
    await controller.handlePaymentRequested(eventFixture, contextMock);

    // Assert: o ID correto é processado e a mensagem é confirmada uma vez.
    expect(paymentWorkerMock.processRequestedPayment).toHaveBeenCalledWith(30);
    expect(channelMock.ack).toHaveBeenCalledWith(messageFixture);
    expect(channelMock.nack).not.toHaveBeenCalled();
  });

  it('envia NACK com requeue quando o PaymentProcessor falha', async () => {
    // Arrange: uma falha transitória representa erro durante o processamento.
    const processorError = new Error('temporary processing failure');
    paymentWorkerMock.processRequestedPayment.mockRejectedValue(processorError);

    // Act: o handler captura o erro para controlar explicitamente a mensagem.
    await controller.handlePaymentRequested(eventFixture, contextMock);

    // Assert: não há ACK; false preserva todas as mensagens e true pede requeue.
    expect(channelMock.ack).not.toHaveBeenCalled();
    expect(channelMock.nack).toHaveBeenCalledWith(messageFixture, false, true);
    expect(console.error).toHaveBeenCalledWith(
      'Error processing payment: 30',
      processorError,
    );
  });
});
