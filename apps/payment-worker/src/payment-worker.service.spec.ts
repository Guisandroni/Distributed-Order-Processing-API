import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
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
  };

  const prismaMock = {
    payment: {
      findUnique: jest.fn(),
      // Este método externo existe apenas para provar que não deve ser usado
      // durante a transação de aprovação ou falha.
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const processingPayment = {
    id: 30,
    orderId: 8,
    status: PaymentStatus.PROCESSING,
    amount: new Prisma.Decimal('26.00'),
    order: {
      items: [
        { productId: 1, quantity: 2 },
        { productId: 2, quantity: 1 },
      ],
    },
  };

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
      ],
    }).compile();

    service = module.get<PaymentWorkerService>(PaymentWorkerService);
  });

  afterEach(() => {
    // Math.random é global; restaurá-lo evita contaminar outros arquivos de teste.
    jest.restoreAllMocks();
  });

  it('rejeita quando o pagamento solicitado não existe', async () => {
    // Arrange: o Prisma não encontra o ID enviado pelo evento.
    prismaMock.payment.findUnique.mockResolvedValue(null);

    // Act: capturamos a exceção para afirmar classe e mensagem na mesma chamada.
    let capturedError: unknown;
    try {
      await service.processRequestedPayment(999);
    } catch (error) {
      capturedError = error;
    }

    // Assert: o processor publica o erro de domínio e não inicia transação.
    expect(capturedError).toBeInstanceOf(NotFoundException);
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
    'é idempotente para o status terminal %s',
    async (status) => {
      // Arrange: pagamentos terminais não devem ser processados novamente.
      const terminalPayment = { ...processingPayment, status };
      prismaMock.payment.findUnique.mockResolvedValue(terminalPayment);
      const randomSpy = jest.spyOn(Math, 'random');

      // Act: o método público recebe um pagamento já finalizado.
      const result = await service.processRequestedPayment(30);

      // Assert: retorna a própria fixture sem aleatoriedade nem escrita.
      expect(result).toBe(terminalPayment);
      expect(randomSpy).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    },
  );

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
    const result = await service.processRequestedPayment(30);

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
    const result = await service.processRequestedPayment(30);

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
});
