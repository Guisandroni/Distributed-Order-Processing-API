import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@lib/prisma';
import { Redis } from 'ioredis';
import { CacheService } from '../src/cache/cache.service';
import { ProductsService } from '../src/products/products.service';
import { OrdersService } from '../src/orders/orders.service';

const databaseUrl = process.env.DATABASE_URL_TEST;
const redisUrl = process.env.REDIS_URL_TEST ?? 'redis://127.0.0.1:6380';

if (
  !databaseUrl ||
  !databaseUrl.includes('order_platform_test') ||
  !databaseUrl.includes(':2021/')
) {
  throw new Error(
    'DATABASE_URL_TEST deve apontar para order_platform_test na porta 2021',
  );
}

describe('Catalog caching com Redis e PostgreSQL reais (integration)', () => {
  let prisma: PrismaService;
  let redis: Redis;
  let cache: CacheService;
  let productsService: ProductsService;
  let ordersService: OrdersService;

  function configFor(database: string, cacheTtlMs = '30000') {
    return {
      getOrThrow: (key: string) => {
        if (key === 'DATABASE_URL') return database;
        throw new Error(`Configuração inesperada: ${key}`);
      },
      get: (key: string, fallback?: string) => {
        if (key === 'REDIS_URL') return redisUrl;
        if (key === 'CACHE_TTL_MS') return cacheTtlMs;
        return fallback;
      },
    } as ConfigService;
  }

  beforeAll(async () => {
    const configService = configFor(databaseUrl);
    prisma = new PrismaService(configService);
    await prisma.$connect();
    redis = new Redis(redisUrl, { lazyConnect: true });
    await redis.connect();
    cache = new CacheService(redis, configService);
    productsService = new ProductsService(prisma, cache as never);
    ordersService = new OrdersService(prisma, {
      orderCreated: jest.fn(),
      orderCancelled: jest.fn(),
    } as never);
  });

  beforeEach(async () => {
    await redis.flushdb();
    await prisma.processedEvent.deleteMany();
    await prisma.outboxEvent.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.product.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await redis.quit();
    await prisma.$disconnect();
  });

  it('segunda leitura vem do cache sem nova consulta ao banco (T006)', async () => {
    // Arrange: um produto no banco e cache frio.
    await productsService.create({
      sku: 'CACHE-1',
      name: 'Produto cache',
      price: 10,
      stock: 5,
    } as never);
    const findManySpy = jest.spyOn(prisma.product, 'findMany');

    // Act: duas leituras idênticas da lista.
    const first = await productsService.findAll();
    const second = await productsService.findAll();

    // Assert: mesmo conteúdo (forma JSON — o cache desserializa Dates
    // como strings ISO, com bytes HTTP idênticos), uma única ida ao banco.
    expect(second).toEqual(JSON.parse(JSON.stringify(first)));
    expect(first).toHaveLength(1);
    expect(findManySpy).toHaveBeenCalledTimes(1);
    findManySpy.mockRestore();
  });

  it('escrita invalida e próxima leitura reflete a mudança (T006)', async () => {
    // Arrange: lista em cache.
    await productsService.create({
      sku: 'CACHE-2',
      name: 'Produto cache',
      price: 10,
      stock: 5,
    } as never);
    expect(await productsService.findAll()).toHaveLength(1);

    // Act: nova escrita e releitura.
    await productsService.create({
      sku: 'CACHE-3',
      name: 'Outro produto',
      price: 20,
      stock: 2,
    } as never);
    const listed = await productsService.findAll();

    // Assert: invalidação funcionou — dois produtos visíveis.
    expect(listed).toHaveLength(2);
  });

  it('criação de pedido reserva estoque pelo banco, fora do cache (T006)', async () => {
    // Arrange: produto com estoque conhecido e lista em cache.
    const user = await prisma.user.create({
      data: {
        name: 'Usuário cache',
        email: 'cache-bypass@example.test',
        password: 'hash-sintetico',
        dateOfBirth: new Date('1990-01-01'),
      },
    });
    const product = await productsService.create({
      sku: 'CACHE-4',
      name: 'Produto estoque',
      price: 25,
      stock: 3,
    } as never);
    expect(await productsService.findAll()).toHaveLength(1);

    // Act: pedido consome 2 unidades (leitura crítica de estoque).
    const order = await ordersService.create(
      { items: [{ productId: product.id, quantity: 2 }] } as never,
      user.id,
    );

    // Assert: reserva exata no banco, sem interferência do cache.
    expect(order).toMatchObject({ userId: user.id });
    const finalProduct = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    expect(finalProduct.stock).toBe(1);
  });
});
