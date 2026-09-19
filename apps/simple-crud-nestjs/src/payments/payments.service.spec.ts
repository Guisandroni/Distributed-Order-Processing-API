import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, PaymentStatus, Prisma, PrismaService } from '@lib/prisma';
import { PaymentsPublisher } from '../messaging/messaging.payments.publisher';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  let service: PaymentsService;

  // O callback da transação recebe um client diferente do Prisma externo.
  // Isso permite afirmar que as duas escritas pertencem à mesma transação.
  const txPrismaMock = {
    payment: {
      create: jest.fn(),
    },
    order: {
      update: jest.fn(),
    },
    outboxEvent: {
      create: jest.fn(),
    },
  };

  const prismaMock = {
    order: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  // O publisher substitui RabbitMQ. O teste observa o evento sem abrir rede.
  const publisherMock = {
    publishPaymentRequested: jest.fn(),
  };

  const pendingOrder = {
    id: 8,
    userId: 7,
    status: OrderStatus.PENDING,
    total: new Prisma.Decimal('26.00'),
    payments: null,
    items: [],
  };

  beforeEach(async () => {
    // Cada caso começa com chamadas, respostas e implementações limpas.
    jest.resetAllMocks();
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof txPrismaMock) => Promise<unknown>) =>
        callback(txPrismaMock),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PaymentsPublisher, useValue: publisherMock },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  it('rejeita quando o pedido do usuário não existe', async () => {
    // Arrange: a consulta pelo par orderId + userId não encontra pedido.
    prismaMock.order.findFirst.mockResolvedValue(null);

    // Act: capturamos a instância para validar classe e mensagem sem executar
    // o método duas vezes. `toEqual(new Error(...))` compararia só a mensagem
    // e deixaria passar por engano o NotFoundError importado do RxJS.
    let capturedError: unknown;
    try {
      await service.process(8, 7, 'corr-1');
    } catch (error) {
      capturedError = error;
    }

    // Assert: a API do Nest deve receber a exceção HTTP que produz status 404.
    expect(capturedError).toBeInstanceOf(NotFoundException);
    expect(capturedError).toMatchObject({ message: 'Order not found' });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(publisherMock.publishPaymentRequested).not.toHaveBeenCalled();
  });

  it('rejeita pagamento de pedido que não está pendente', async () => {
    // Arrange: pedidos cancelados não podem iniciar pagamento.
    prismaMock.order.findFirst.mockResolvedValue({
      ...pendingOrder,
      status: OrderStatus.CANCELLED,
    });

    // Act + Assert: nenhuma escrita ou publicação ocorre nesse ramo.
    await expect(service.process(8, 7, 'corr-1')).rejects.toEqual(
      new BadRequestException(
        `Order with status ${OrderStatus.CANCELLED} cannot be paid`,
      ),
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(publisherMock.publishPaymentRequested).not.toHaveBeenCalled();
  });

  it('rejeita quando o pedido já possui pagamento', async () => {
    // Arrange: a relação opcional contém um pagamento existente.
    prismaMock.order.findFirst.mockResolvedValue({
      ...pendingOrder,
      payments: { id: 30 },
    });

    // Act + Assert: o mesmo pedido não pode gerar um segundo pagamento.
    await expect(service.process(8, 7, 'corr-1')).rejects.toEqual(
      new BadRequestException('Order already have payment exists'),
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(publisherMock.publishPaymentRequested).not.toHaveBeenCalled();
  });

  it('cria pagamento, atualiza pedido e registra o outbox sem publicar direto', async () => {
    // Arrange: pedido pendente e sem pagamento pode entrar em processamento.
    const payment = {
      id: 30,
      orderId: 8,
      status: PaymentStatus.PROCESSING,
      amount: new Prisma.Decimal('26.00'),
    };
    prismaMock.order.findFirst.mockResolvedValue(pendingOrder);
    txPrismaMock.payment.create.mockResolvedValue(payment);
    txPrismaMock.order.update.mockResolvedValue({
      ...pendingOrder,
      status: OrderStatus.PROCESSING,
    });
    txPrismaMock.outboxEvent.create.mockResolvedValue({ id: 'outbox-1' });

    // Act: process persiste a intenção; o poller publica depois.
    const result = await service.process(8, 7, 'corr-1');

    // Assert: pagamento e pedido mudam juntos para PROCESSING.
    expect(result).toBe(payment);
    expect(txPrismaMock.payment.create).toHaveBeenCalledWith({
      data: {
        orderId: 8,
        amount: pendingOrder.total,
        status: PaymentStatus.PROCESSING,
      },
    });
    expect(txPrismaMock.order.update).toHaveBeenCalledWith({
      where: { id: 8 },
      data: { status: OrderStatus.PROCESSING },
    });

    // O evento usa apenas dados públicos e converte Decimal para string.
    expect(txPrismaMock.outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'payment.requested',
        aggregateId: '8',
      }),
    });
    expect(publisherMock.publishPaymentRequested).not.toHaveBeenCalled();
  });

  it('não publica evento quando a transação falha', async () => {
    // Arrange: o pedido existe, mas a fronteira transacional rejeita.
    const transactionError = new Error('transaction failed');
    prismaMock.order.findFirst.mockResolvedValue(pendingOrder);
    prismaMock.$transaction.mockRejectedValue(transactionError);

    // Act + Assert: o erro propaga e nenhum consumidor recebe evento inválido.
    await expect(service.process(8, 7, 'corr-1')).rejects.toBe(
      transactionError,
    );
    expect(publisherMock.publishPaymentRequested).not.toHaveBeenCalled();
  });

  it('persiste pagamento + pedido + OutboxEvent PENDING na mesma transação (T018)', async () => {
    // Arrange: pedido pendente e sem pagamento pode entrar em processamento.
    const payment = {
      id: 30,
      orderId: 8,
      status: PaymentStatus.PROCESSING,
      amount: new Prisma.Decimal('26.00'),
    };
    prismaMock.order.findFirst.mockResolvedValue(pendingOrder);
    txPrismaMock.payment.create.mockResolvedValue(payment);
    txPrismaMock.order.update.mockResolvedValue({
      ...pendingOrder,
      status: OrderStatus.PROCESSING,
    });
    txPrismaMock.outboxEvent.create.mockResolvedValue({ id: 'outbox-1' });

    // Act: process persiste a intenção de publicar junto com o domínio.
    const result = await service.process(8, 7, 'corr-1');

    // Assert: fronteira transacional única com as três escritas dentro.
    expect(result).toBe(payment);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(txPrismaMock.payment.create).toHaveBeenCalledTimes(1);
    expect(txPrismaMock.order.update).toHaveBeenCalledTimes(1);
    expect(txPrismaMock.outboxEvent.create).toHaveBeenCalledTimes(1);
    expect(txPrismaMock.outboxEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: 'payment.requested',
        aggregateId: '8',
      }),
    });

    // O payload é o envelope DomainEvent completo serializado em JSON.
    const outboxData = txPrismaMock.outboxEvent.create.mock.calls[0][0].data;
    expect(outboxData.payload).toMatchObject({
      eventType: 'payment.requested',
      correlationId: 'corr-1',
      payload: {
        paymentId: 30,
        orderId: 8,
        userId: 7,
        amount: '26',
      },
    });
    expect(typeof outboxData.payload.eventId).toBe('string');
    expect(typeof outboxData.payload.occurredAt).toBe('string');

    // Sem publish direto: a entrega é dever do poller (sobrevive ao broker down).
    expect(publisherMock.publishPaymentRequested).not.toHaveBeenCalled();
  });

  it('não cria outbox quando a transação falha (T018)', async () => {
    // Arrange: o pedido existe, mas a fronteira transacional rejeita.
    const transactionError = new Error('transaction failed');
    prismaMock.order.findFirst.mockResolvedValue(pendingOrder);
    prismaMock.$transaction.mockRejectedValue(transactionError);

    // Act + Assert: nada persiste e nada é publicado.
    await expect(service.process(8, 7, 'corr-1')).rejects.toBe(
      transactionError,
    );
    expect(txPrismaMock.outboxEvent.create).not.toHaveBeenCalled();
    expect(publisherMock.publishPaymentRequested).not.toHaveBeenCalled();
  });
});
