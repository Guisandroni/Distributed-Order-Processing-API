import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrderStatus, Prisma, PrismaService } from '@lib/prisma';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  let service: OrdersService;

  // O client transacional é separado do Prisma externo. Essa separação permite
  // verificar que criação do pedido e alterações de estoque são atômicas.
  const txPrismaMock = {
    order: {
      create: jest.fn(),
      update: jest.fn(),
    },
    product: {
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  // O Prisma externo executa leituras e inicia a transação. Cada método é um
  // mock explícito para o teste não depender de um banco real.
  const prismaMock = {
    product: {
      findMany: jest.fn(),
    },
    order: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const keyboard = {
    id: 1,
    name: 'Teclado',
    price: new Prisma.Decimal('10.50'),
    stock: 5,
    active: true,
  };
  const cable = {
    id: 2,
    name: 'Cabo',
    price: new Prisma.Decimal('5.00'),
    stock: 3,
    active: true,
  };

  beforeEach(async () => {
    // Remove respostas e contagens anteriores para um teste não afetar outro.
    jest.resetAllMocks();

    // O mock executa de verdade o callback, mas entrega o client transacional
    // falso. Isso exercita o fluxo do service sem PostgreSQL.
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof txPrismaMock) => Promise<unknown>) =>
        callback(txPrismaMock),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('rejeita quando algum produto não existe ou está inativo', async () => {
    // Arrange: o DTO possui dois IDs, mas o Prisma retorna somente um produto.
    prismaMock.product.findMany.mockResolvedValue([keyboard]);

    // Act + Assert: o service encerra antes de iniciar qualquer transação.
    await expect(
      service.create(
        {
          items: [
            { productId: 1, quantity: 1 },
            { productId: 2, quantity: 1 },
          ],
        },
        7,
      ),
    ).rejects.toEqual(
      new NotFoundException(
        'One or more products do not exist or are inactive',
      ),
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejeita quando o estoque é menor que a quantidade solicitada', async () => {
    // Arrange: existe somente uma unidade, mas o pedido solicita duas.
    prismaMock.product.findMany.mockResolvedValue([{ ...keyboard, stock: 1 }]);

    // Act + Assert: estoque insuficiente não pode criar pedido nem transação.
    await expect(
      service.create({ items: [{ productId: 1, quantity: 2 }] }, 7),
    ).rejects.toEqual(
      new BadRequestException('Insuficient stock for product Teclado'),
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('cria pedido com total, itens e reserva de estoque na transação', async () => {
    // Arrange: 2 × 10.50 + 1 × 5.00 possui total conhecido de 26.00.
    const dto = {
      items: [
        { productId: 1, quantity: 2 },
        { productId: 2, quantity: 1 },
      ],
    };
    const createdOrder = {
      id: 20,
      userId: 7,
      status: OrderStatus.PENDING,
      total: new Prisma.Decimal('26.00'),
    };
    prismaMock.product.findMany.mockResolvedValue([keyboard, cable]);
    txPrismaMock.order.create.mockResolvedValue(createdOrder);
    txPrismaMock.product.updateMany.mockResolvedValue({ count: 1 });

    // Act: chamamos o método público com o usuário dono do pedido.
    const result = await service.create(dto, 7);

    // Assert: o valor esperado é literal e independente do loop de produção.
    expect(result).toBe(createdOrder);
    const createArgs = txPrismaMock.order.create.mock.calls[0][0];
    expect(createArgs.data.total.toString()).toBe('26');
    expect(createArgs.data.items.create).toEqual([
      {
        productId: 1,
        quantity: 2,
        unitPrice: keyboard.price,
      },
      {
        productId: 2,
        quantity: 1,
        unitPrice: cable.price,
      },
    ]);

    // Cada produto é reservado por uma escrita condicional no mesmo client.
    expect(txPrismaMock.product.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 1, active: true, stock: { gte: 2 } },
      data: { stock: { decrement: 2 } },
    });
    expect(txPrismaMock.product.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 2, active: true, stock: { gte: 1 } },
      data: { stock: { decrement: 1 } },
    });
  });

  it('rejeita cancelamento quando o pedido não existe para o usuário', async () => {
    // Arrange: findFirst não localiza o par orderId + userId.
    prismaMock.order.findFirst.mockResolvedValue(null);

    // Act + Assert: não existe transação para um pedido ausente.
    await expect(service.cancel(20, 7)).rejects.toEqual(
      new NotFoundException('Order not found'),
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('rejeita cancelamento quando o pedido não está pendente', async () => {
    // Arrange: um pedido em processamento já não pode ser cancelado.
    prismaMock.order.findFirst.mockResolvedValue({
      id: 20,
      userId: 7,
      status: OrderStatus.PROCESSING,
      items: [],
    });

    // Act + Assert: a regra de status impede qualquer escrita.
    await expect(service.cancel(20, 7)).rejects.toEqual(
      new BadRequestException(
        `Only pending ${OrderStatus.PROCESSING} can be cancelled`,
      ),
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('cancela pedido pendente e devolve todos os itens ao estoque', async () => {
    // Arrange: o pedido possui duas linhas que precisam ser devolvidas.
    const order = {
      id: 20,
      userId: 7,
      status: OrderStatus.PENDING,
      items: [
        { productId: 1, quantity: 2 },
        { productId: 2, quantity: 1 },
      ],
    };
    const cancelledOrder = {
      ...order,
      status: OrderStatus.CANCELLED,
    };
    prismaMock.order.findFirst.mockResolvedValue(order);
    txPrismaMock.order.update.mockResolvedValue(cancelledOrder);
    txPrismaMock.product.update.mockResolvedValue({});

    // Act: cancel executa mudança de status e reposição na mesma transação.
    const result = await service.cancel(20, 7);

    // Assert: o pedido fica cancelado e cada quantidade volta ao estoque.
    expect(result).toBe(cancelledOrder);
    expect(txPrismaMock.order.update).toHaveBeenCalledWith({
      where: { id: 20 },
      data: { status: OrderStatus.CANCELLED },
    });
    expect(txPrismaMock.product.update).toHaveBeenNthCalledWith(1, {
      where: { id: 1 },
      data: { stock: { increment: 2 } },
    });
    expect(txPrismaMock.product.update).toHaveBeenNthCalledWith(2, {
      where: { id: 2 },
      data: { stock: { increment: 1 } },
    });
  });

  it('lista os pedidos usando a fronteira Prisma', async () => {
    // Arrange: a fronteira devolve uma lista conhecida.
    const orders = [{ id: 20 }, { id: 21 }];
    prismaMock.order.findMany.mockResolvedValue(orders);

    // Act: o método público consulta todos os pedidos.
    const result = await service.findAll();

    // Assert: o service devolve a mesma lista e faz uma única consulta.
    expect(result).toBe(orders);
    expect(prismaMock.order.findMany).toHaveBeenCalledTimes(1);
  });
});
