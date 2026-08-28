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
      await service.process(8, 7);
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
    await expect(service.process(8, 7)).rejects.toEqual(
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
    await expect(service.process(8, 7)).rejects.toEqual(
      new BadRequestException('Order already have payment exists'),
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(publisherMock.publishPaymentRequested).not.toHaveBeenCalled();
  });

  it('cria pagamento, atualiza pedido e publica o evento solicitado', async () => {
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

    // Act: process executa persistência e, depois, publica o evento.
    const result = await service.process(8, 7);

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
    expect(publisherMock.publishPaymentRequested).toHaveBeenCalledWith({
      paymentId: 30,
      orderId: 8,
      userId: 7,
      amount: '26',
    });
  });

  it('não publica evento quando a transação falha', async () => {
    // Arrange: o pedido existe, mas a fronteira transacional rejeita.
    const transactionError = new Error('transaction failed');
    prismaMock.order.findFirst.mockResolvedValue(pendingOrder);
    prismaMock.$transaction.mockRejectedValue(transactionError);

    // Act + Assert: o erro propaga e nenhum consumidor recebe evento inválido.
    await expect(service.process(8, 7)).rejects.toBe(transactionError);
    expect(publisherMock.publishPaymentRequested).not.toHaveBeenCalled();
  });
});
