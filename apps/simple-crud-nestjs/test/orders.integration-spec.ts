import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, Prisma, PrismaService } from '@lib/prisma';
import { OrdersService } from '../src/orders/orders.service';
import { ProductsService } from '../src/products/products.service';

const databaseUrl = process.env.DATABASE_URL_TEST;

if (
  !databaseUrl ||
  !databaseUrl.includes('order_platform_test') ||
  !databaseUrl.includes(':2021/')
) {
  throw new Error(
    'DATABASE_URL_TEST deve apontar para order_platform_test na porta 2021',
  );
}

describe('OrdersService com Prisma e PostgreSQL (integration)', () => {
  let prisma: PrismaService;
  let ordersService: OrdersService;
  let productsService: ProductsService;

  beforeAll(async () => {
    const configService = {
      getOrThrow: (key: string) => {
        if (key !== 'DATABASE_URL') {
          throw new Error(`Configuração inesperada: ${key}`);
        }
        return databaseUrl;
      },
    } as ConfigService;

    prisma = new PrismaService(configService);
    ordersService = new OrdersService(prisma);
    productsService = new ProductsService(prisma);
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.product.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('persiste o pedido e decrementa o estoque no PostgreSQL', async () => {
    const user = await prisma.user.create({
      data: {
        name: 'Usuário de integração',
        email: 'integration@example.test',
        password: 'hash-sintetico',
        dateOfBirth: new Date('1990-01-01'),
      },
    });
    const keyboard = await prisma.product.create({
      data: {
        sku: 'KEYBOARD-INT',
        name: 'Teclado',
        price: new Prisma.Decimal('10.50'),
        stock: 5,
      },
    });
    const mouse = await prisma.product.create({
      data: {
        sku: 'MOUSE-INT',
        name: 'Mouse',
        price: new Prisma.Decimal('5.00'),
        stock: 3,
      },
    });

    const order = await ordersService.create(
      {
        items: [
          { productId: keyboard.id, quantity: 2 },
          { productId: mouse.id, quantity: 1 },
        ],
      },
      user.id,
    );

    expect(order).toMatchObject({
      userId: user.id,
      status: OrderStatus.PENDING,
    });
    expect(order.total.toString()).toBe('26');
    expect(order.items).toHaveLength(2);

    await expect(ordersService.findAll()).resolves.toEqual([
      expect.objectContaining({ id: order.id, userId: user.id }),
    ]);
    await expect(productsService.findOne(keyboard.id)).resolves.toMatchObject({
      stock: 3,
    });
    await expect(productsService.findOne(mouse.id)).resolves.toMatchObject({
      stock: 2,
    });
  });

  it('permite apenas uma reserva concorrente para a última unidade', async () => {
    const user = await prisma.user.create({
      data: {
        name: 'Usuário concorrente',
        email: 'concurrency@example.test',
        password: 'hash-sintetico',
        dateOfBirth: new Date('1990-01-01'),
      },
    });
    const product = await prisma.product.create({
      data: {
        sku: 'LAST-UNIT-INT',
        name: 'Última unidade',
        price: new Prisma.Decimal('15.00'),
        stock: 1,
      },
    });
    const dto = {
      items: [{ productId: product.id, quantity: 1 }],
    };

    //  força as duas chamadas a lerem estoque 1 antes de qualquer
    // transação continuar. Sem sincronização, o agendador pode serializar as
    // Promises por acaso e esconder a condição de corrida.
    let releaseBothReads!: () => void;
    const bothReadsComplete = new Promise<void>((resolve) => {
      releaseBothReads = resolve;
    });
    let completedReads = 0;
    const realFindMany = prisma.product.findMany.bind(prisma.product);
    const synchronizedFindMany = async (
      args?: Parameters<typeof prisma.product.findMany>[0],
    ) => {
      const products = await realFindMany(args);
      completedReads += 1;
      if (completedReads === 2) {
        releaseBothReads();
      }
      await bothReadsComplete;
      return products;
    };
    const findManySpy = jest.spyOn(prisma.product, 'findMany');
    findManySpy.mockImplementation(
      synchronizedFindMany as unknown as typeof prisma.product.findMany,
    );

    let results: PromiseSettledResult<unknown>[];
    try {
      results = await Promise.allSettled([
        ordersService.create(dto, user.id),
        ordersService.create(dto, user.id),
      ]);
    } finally {
      findManySpy.mockRestore();
    }

    expect(results.map((result) => result.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(rejected?.reason).toBeInstanceOf(BadRequestException);
    await expect(productsService.findOne(product.id)).resolves.toMatchObject({
      stock: 0,
    });
    await expect(ordersService.findAll()).resolves.toHaveLength(1);
  });

  it('mantém o estoque quando a quantidade solicitada é insuficiente', async () => {
    const user = await prisma.user.create({
      data: {
        name: 'Usuário sem estoque',
        email: 'test@example.test',
        password: 'HashPasswordTest',
        dateOfBirth: new Date('1990-01-01'),
      },
    });
    const product = await prisma.product.create({
      data: {
        sku: 'LIMITADO-INT',
        name: 'Produto limitado',
        price: new Prisma.Decimal('20.00'),
        stock: 1,
      },
    });

    await expect(
      ordersService.create(
        { items: [{ productId: product.id, quantity: 2 }] },
        user.id,
      ),
    ).rejects.toEqual(
      new BadRequestException('Insuficient stock for product Produto limitado'),
    );

    await expect(productsService.findOne(product.id)).resolves.toMatchObject({
      stock: 1,
    });
    await expect(ordersService.findAll()).resolves.toHaveLength(0);
  });

  it('devolve o estoque ao cancelar um pedido pendente', async () => {
    const user = await prisma.user.create({
      data: {
        name: 'Usuário que cancela',
        email: 'testCancel@example.test',
        password: 'HashPasswordTest',
        dateOfBirth: new Date('1990-01-01'),
      },
    });
    const product = await prisma.product.create({
      data: {
        sku: 'CANCEL-INT',
        name: 'Produto cancelável',
        price: new Prisma.Decimal('30.00'),
        stock: 5,
      },
    });
    const order = await ordersService.create(
      { items: [{ productId: product.id, quantity: 2 }] },
      user.id,
    );

    await expect(productsService.findOne(product.id)).resolves.toMatchObject({
      stock: 3,
    });

    await expect(
      ordersService.cancel(order.id, user.id),
    ).resolves.toMatchObject({
      id: order.id,
      status: OrderStatus.CANCELLED,
    });
    await expect(productsService.findOne(product.id)).resolves.toMatchObject({
      stock: 5,
    });
  });
});
