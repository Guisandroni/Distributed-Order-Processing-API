import { Test, TestingModule } from '@nestjs/testing';
import { NonRetryableError } from '../../../libs/contracts/src/processing-errors';
import type { PaymentRequestedEvent } from '../../../libs/contracts/src/payment-events';
import { constants } from '../../../libs/contracts/src/payment-events';
import { OrderStatus, PaymentStatus, Prisma, PrismaService } from '@lib/prisma';
import { PaymentWorkerService } from './payment-worker.service';

describe('PaymentWorkerService (PaymentProcessor)', () => {
  let service: PaymentWorkerService;

  // Todas as escritas devem usar o client recebido pelo callback transacional.
  // Manter esse mock separado do Prisma externo detecta escritas fora do rollback.
  const txPrismaMock = {
    payment: {
      update: jest.fn(),
    },
    order: {
      update: jest.fn(),
    },
    product: {
      update: jest.fn(),
    },
    processedEvent: {
      create: jest.fn(),
    },
  };

  const resultsClientMock = {
    emit: jest.fn(),
  };

  const prismaMock = {
    payment: {
      findUnique: jest.fn(),
      // Este método externo existe apenas para provar que não deve ser usado
      // durante a transação de aprovação ou falha.
      update: jest.fn(),
    },
    processedEvent: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const processingPayment = {
    id: 30,
    orderId: 8,
    status: PaymentStatus.PROCESSING,
    amount: new Prisma.Decimal('26.00'),
    order: {
      id: 8,
      userId: 7,
      items: [
        { productId: 1, quantity: 2 },
        { productId: 2, quantity: 1 },
      ],
    },
  };

  // O worker processa o envelope DomainEvent completo (identidade do evento
  // via eventId/eventType, roteamento do pagamento via payload).
  function requestedEvent(
    paymentId: number,
    eventId = 'evt-1',
    correlationId = 'corr-1',
  ): PaymentRequestedEvent {
    return {
      eventId,
      eventType: 'payment.requested',
      occurredAt: new Date().toISOString(),
      correlationId,
      payload: { paymentId, orderId: 8, userId: 7, amount: '26' },
    };
  }

  beforeEach(async () => {
    // Limpa mocks e executa o callback com o transaction client controlado.
    jest.resetAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof txPrismaMock) => Promise<unknown>) =>
        callback(txPrismaMock),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentWorkerService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: constants.paymentsResultsClient,
          useValue: resultsClientMock,
        },
      ],
    }).compile();

    service = module.get<PaymentWorkerService>(PaymentWorkerService);
  });

  afterEach(() => {
    // Math.random é global; restaurá-lo evita contaminar outros arquivos de teste.
    jest.restoreAllMocks();
  });

  it('rejeita como não-retentável quando o pagamento solicitado não existe', async () => {
    // Arrange: o Prisma não encontra o ID enviado pelo evento.
    prismaMock.payment.findUnique.mockResolvedValue(null);

    // Act: capturamos a exceção para afirmar classe e mensagem na mesma chamada.
    let capturedError: unknown;
    try {
      await service.processRequestedPayment(requestedEvent(999));
    } catch (error) {
      capturedError = error;
    }

    // Assert: erro permanente (vai direto para a DLQ) e não inicia transação.
    expect(capturedError).toBeInstanceOf(NonRetryableError);
    expect(capturedError).toMatchObject({ message: 'Payment not found' });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.payment.findUnique).toHaveBeenCalledWith({
      where: { id: 999 },
      include: {
        order: {
          include: { items: true },
        },
      },
    });
  });

  it.each([PaymentStatus.APPROVED, PaymentStatus.FAILED])(
    'rejeita como não-retentável a reentrada no status terminal %s',
    async (status) => {
      // Arrange: pagamentos terminais não admitem nova transição.
      const terminalPayment = { ...processingPayment, status };
      prismaMock.payment.findUnique.mockResolvedValue(terminalPayment);
      const randomSpy = jest.spyOn(Math, 'random');

      // Act: capturamos a exceção de transição inválida.
      let capturedError: unknown;
      try {
        await service.processRequestedPayment(requestedEvent(30));
      } catch (error) {
        capturedError = error;
      }

      // Assert: erro permanente sem aleatoriedade nem escrita.
      expect(capturedError).toBeInstanceOf(NonRetryableError);
      expect(randomSpy).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    },
  );

  it('propaga erro desconhecido sem classificá-lo como permanente', async () => {
    // Arrange: falha de infraestrutura não permite decidir pela mensagem.
    const infraError = new Error('connection reset');
    prismaMock.payment.findUnique.mockRejectedValue(infraError);

    // Act: o erro atravessa o service sem conversão para permanente.
    let capturedError: unknown;
    try {
      await service.processRequestedPayment(requestedEvent(30));
    } catch (error) {
      capturedError = error;
    }

    // Assert: erro desconhecido permanece retentável (o consumer decide pelo retry).
    expect(capturedError).toBe(infraError);
    expect(capturedError).not.toBeInstanceOf(NonRetryableError);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('aprova quando a amostra aleatória é menor que 0.8', async () => {
    // Arrange: 0.79 escolhe deterministicamente o ramo de aprovação.
    const approvedPayment = {
      ...processingPayment,
      status: PaymentStatus.APPROVED,
    };
    prismaMock.payment.findUnique.mockResolvedValue(processingPayment);
    txPrismaMock.payment.update.mockResolvedValue(approvedPayment);
    txPrismaMock.order.update.mockResolvedValue({
      id: 8,
      status: OrderStatus.PAID,
    });
    jest.spyOn(Math, 'random').mockReturnValue(0.79);

    // Act: processamos pelo único seam público do worker.
    const result = await service.processRequestedPayment(requestedEvent(30));

    // Assert: pagamento e pedido são escritos no mesmo transaction client.
    expect(result).toBe(approvedPayment);
    expect(txPrismaMock.payment.update).toHaveBeenCalledWith({
      where: { id: 30 },
      data: { status: PaymentStatus.APPROVED },
    });
    expect(txPrismaMock.order.update).toHaveBeenCalledWith({
      where: { id: 8 },
      data: { status: OrderStatus.PAID },
    });
    expect(prismaMock.payment.update).not.toHaveBeenCalled();
  });

  it('falha quando a amostra é 0.8 e devolve os itens ao estoque', async () => {
    // Arrange: o limite 0.8 pertence ao ramo de falha.
    const failedPayment = {
      ...processingPayment,
      status: PaymentStatus.FAILED,
    };
    prismaMock.payment.findUnique.mockResolvedValue(processingPayment);
    txPrismaMock.payment.update.mockResolvedValue(failedPayment);
    txPrismaMock.order.update.mockResolvedValue({
      id: 8,
      status: OrderStatus.FAILED,
    });
    txPrismaMock.product.update.mockResolvedValue({});
    jest.spyOn(Math, 'random').mockReturnValue(0.8);

    // Act: o processor executa o ramo de falha pelo método público.
    const result = await service.processRequestedPayment(requestedEvent(30));

    // Assert: estados e reposições pertencem à mesma transação.
    expect(result).toBe(failedPayment);
    expect(txPrismaMock.payment.update).toHaveBeenCalledWith({
      where: { id: 30 },
      data: { status: PaymentStatus.FAILED },
    });
    expect(txPrismaMock.order.update).toHaveBeenCalledWith({
      where: { id: 8 },
      data: { status: OrderStatus.FAILED },
    });
    expect(txPrismaMock.product.update).toHaveBeenNthCalledWith(1, {
      where: { id: 1 },
      data: { stock: { increment: 2 } },
    });
    expect(txPrismaMock.product.update).toHaveBeenNthCalledWith(2, {
      where: { id: 2 },
      data: { stock: { increment: 1 } },
    });
    expect(prismaMock.payment.update).not.toHaveBeenCalled();
  });

  it('registra o claim ProcessedEvent dentro da transação no primeiro processamento (T014)', async () => {
    // Arrange: evento inédito sobre pagamento em processamento.
    const approvedPayment = {
      ...processingPayment,
      status: PaymentStatus.APPROVED,
    };
    prismaMock.payment.findUnique.mockResolvedValue(processingPayment);
    prismaMock.processedEvent.findUnique.mockResolvedValue(null);
    txPrismaMock.payment.update.mockResolvedValue(approvedPayment);
    txPrismaMock.order.update.mockResolvedValue({
      id: 8,
      status: OrderStatus.PAID,
    });
    txPrismaMock.processedEvent.create.mockResolvedValue({ id: 'claim-1' });
    jest.spyOn(Math, 'random').mockReturnValue(0.79);

    // Act: processamos o envelope completo pelo seam público.
    const result = await service.processRequestedPayment(requestedEvent(30));

    // Assert: claim consultado e inserido via tx, antes das escritas de negócio.
    expect(result).toBe(approvedPayment);
    expect(prismaMock.processedEvent.findUnique).toHaveBeenCalledWith({
      where: { eventId: 'evt-1' },
    });
    expect(txPrismaMock.processedEvent.create).toHaveBeenCalledWith({
      data: { eventId: 'evt-1', eventType: 'payment.requested' },
    });
  });

  it('segunda entrega com mesmo eventId retorna o pagamento sem nenhuma escrita (T014)', async () => {
    // Arrange: o claim já existe (primeira entrega comitou, ACK se perdeu).
    prismaMock.payment.findUnique.mockResolvedValue(processingPayment);
    prismaMock.processedEvent.findUnique.mockResolvedValue({
      id: 'claim-1',
      eventId: 'evt-1',
      eventType: 'payment.requested',
    });
    const randomSpy = jest.spyOn(Math, 'random');

    // Act: a redelivery retorna o pagamento atual intocado.
    const result = await service.processRequestedPayment(requestedEvent(30));

    // Assert: zero escritas de negócio, zero nova transação, sem sorteio.
    expect(result).toBe(processingPayment);
    expect(randomSpy).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(txPrismaMock.processedEvent.create).not.toHaveBeenCalled();
    expect(txPrismaMock.payment.update).not.toHaveBeenCalled();
    expect(txPrismaMock.order.update).not.toHaveBeenCalled();
    expect(txPrismaMock.product.update).not.toHaveBeenCalled();
    expect(prismaMock.payment.update).not.toHaveBeenCalled();
  });

  it('corrida de entregas simultâneas: unique-violation vira duplicata sem escrita (T014)', async () => {
    // Arrange: a pré-leitura não viu o claim, mas a inserção na tx colide
    // (outra entrega comitou entre as duas operações).
    prismaMock.payment.findUnique.mockResolvedValue(processingPayment);
    prismaMock.processedEvent.findUnique.mockResolvedValue(null);
    const collision = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed on the fields: (`eventId`)',
      { code: 'P2002', clientVersion: 'test' },
    );
    txPrismaMock.processedEvent.create.mockRejectedValue(collision);
    jest.spyOn(Math, 'random').mockReturnValue(0.79);

    // Act: a colisão retorna o pagamento atual intocado.
    const result = await service.processRequestedPayment(requestedEvent(30));

    // Assert: nenhuma escrita de negócio sobrevive à duplicata.
    expect(result).toBe(processingPayment);
    expect(txPrismaMock.payment.update).not.toHaveBeenCalled();
    expect(txPrismaMock.order.update).not.toHaveBeenCalled();
    expect(txPrismaMock.product.update).not.toHaveBeenCalled();
    expect(prismaMock.payment.update).not.toHaveBeenCalled();
  });

  it('aprovação emite payment.approved com eventId novo e correlationId propagado (T024)', async () => {
    // Arrange: evento inédito com aprovação determinística.
    const approvedPayment = {
      ...processingPayment,
      status: PaymentStatus.APPROVED,
    };
    prismaMock.payment.findUnique.mockResolvedValue(processingPayment);
    prismaMock.processedEvent.findUnique.mockResolvedValue(null);
    txPrismaMock.payment.update.mockResolvedValue(approvedPayment);
    txPrismaMock.order.update.mockResolvedValue({
      id: 8,
      status: OrderStatus.PAID,
    });
    txPrismaMock.processedEvent.create.mockResolvedValue({ id: 'claim-1' });
    jest.spyOn(Math, 'random').mockReturnValue(0.79);

    // Act: processamos o envelope pelo seam público.
    const result = await service.processRequestedPayment(
      requestedEvent(30, 'evt-approved-1', 'corr-approved-1'),
    );

    // Assert: um approved com identidade nova e correlação de origem.
    expect(result).toBe(approvedPayment);
    expect(resultsClientMock.emit).toHaveBeenCalledTimes(1);
    const [pattern, envelope] = resultsClientMock.emit.mock.calls[0] as [
      string,
      PaymentRequestedEvent,
    ];
    expect(pattern).toBe('PAYMENT_APPROVED_EVENT');
    expect(envelope.eventType).toBe('payment.approved');
    expect(envelope.eventId).not.toBe('evt-approved-1');
    expect(typeof envelope.eventId).toBe('string');
    expect(envelope.correlationId).toBe('corr-approved-1');
    expect(envelope.payload).toEqual({
      paymentId: 30,
      orderId: 8,
      userId: 7,
      amount: '26',
    });
  });

  it('falha emite payment.failed com motivo, eventId novo e correlationId propagado (T024)', async () => {
    // Arrange: evento inédito com falha determinística.
    const failedPayment = {
      ...processingPayment,
      status: PaymentStatus.FAILED,
    };
    prismaMock.payment.findUnique.mockResolvedValue(processingPayment);
    prismaMock.processedEvent.findUnique.mockResolvedValue(null);
    txPrismaMock.payment.update.mockResolvedValue(failedPayment);
    txPrismaMock.order.update.mockResolvedValue({
      id: 8,
      status: OrderStatus.FAILED,
    });
    txPrismaMock.product.update.mockResolvedValue({});
    txPrismaMock.processedEvent.create.mockResolvedValue({ id: 'claim-1' });
    jest.spyOn(Math, 'random').mockReturnValue(0.8);

    // Act: processamos o envelope pelo seam público.
    const result = await service.processRequestedPayment(
      requestedEvent(30, 'evt-failed-1', 'corr-failed-1'),
    );

    // Assert: um failed com motivo, identidade nova e correlação de origem.
    expect(result).toBe(failedPayment);
    expect(resultsClientMock.emit).toHaveBeenCalledTimes(1);
    const [pattern, envelope] = resultsClientMock.emit.mock.calls[0] as [
      string,
      PaymentRequestedEvent & { payload: { reason: string } },
    ];
    expect(pattern).toBe('PAYMENT_FAILED_EVENT');
    expect(envelope.eventType).toBe('payment.failed');
    expect(envelope.eventId).not.toBe('evt-failed-1');
    expect(typeof envelope.eventId).toBe('string');
    expect(envelope.correlationId).toBe('corr-failed-1');
    expect(envelope.payload).toMatchObject({
      paymentId: 30,
      orderId: 8,
      userId: 7,
      amount: '26',
    });
    expect(typeof envelope.payload.reason).toBe('string');
    expect(envelope.payload.reason.length).toBeGreaterThan(0);
  });

  it('duplicata confirmada não emite resultado (T024)', async () => {
    // Arrange: o claim já existe — segunda entrega do mesmo evento.
    prismaMock.payment.findUnique.mockResolvedValue(processingPayment);
    prismaMock.processedEvent.findUnique.mockResolvedValue({
      id: 'claim-1',
      eventId: 'evt-1',
      eventType: 'payment.requested',
    });

    // Act: a redelivery retorna sem efeito e sem resultado.
    const result = await service.processRequestedPayment(requestedEvent(30));

    // Assert: pagamento intocado e nenhum evento de resultado.
    expect(result).toBe(processingPayment);
    expect(resultsClientMock.emit).not.toHaveBeenCalled();
  });
});
