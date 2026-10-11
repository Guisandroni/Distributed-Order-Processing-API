import { ConfigService } from '@nestjs/config';
import { OrderStatus, PaymentStatus, Prisma, PrismaService } from '@lib/prisma';
// Sem `@lib/contracts` aqui: o jest de integração não mapeia esse alias
// (ver jest-integration.json) — literais inline + import relativo.
import { NonRetryableError } from '../../../libs/contracts/src/processing-errors';
import { PaymentWorkerService } from '../../payment-worker/src/payment-worker.service';
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

describe('PaymentWorkerService redelivery com PostgreSQL real (integration)', () => {
  let prisma: PrismaService;
  let worker: PaymentWorkerService;
  let ordersService: OrdersService;
  let productsService: ProductsService;

  function requestedEvent(
    paymentId: number,
    orderId: number,
    userId: number,
    eventId: string,
  ) {
    return {
      eventId,
      eventType: 'payment.requested',
      occurredAt: new Date().toISOString(),
      correlationId: `corr-${eventId}`,
      payload: { paymentId, orderId, userId, amount: '50' },
    };
  }

  async function processingFixture(sku: string) {
    const user = await prisma.user.create({
      data: {
        name: 'Usuário redelivery',
        email: `${sku}@example.test`,
        password: 'hash-sintetico',
        dateOfBirth: new Date('1990-01-01'),
      },
    });
    const product = await productsService.create({
      sku,
      name: 'Produto redelivery',
      price: 25,
      stock: 3,
    } as never);
    const order = await ordersService.create(
      { items: [{ productId: product.id, quantity: 2 }] } as never,
      user.id,
    );
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        amount: new Prisma.Decimal('50'),
        status: PaymentStatus.PROCESSING,
      },
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.PROCESSING },
    });
    return { user, product, order, payment };
  }

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
    worker = new PaymentWorkerService(prisma, { emit: jest.fn() } as never);
    ordersService = new OrdersService(prisma);
    productsService = new ProductsService(prisma);
    await prisma.$connect();
  });

  beforeEach(async () => {
    await prisma.processedEvent.deleteMany();
    await prisma.outboxEvent.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.product.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('entrega duplicada do mesmo eventId cobra uma única vez (T015)', async () => {
    // Arrange: pagamento em processamento com aprovação determinística.
    const { user, product, order, payment } =
      await processingFixture('REDELIVERY-1');
    jest.spyOn(Math, 'random').mockReturnValue(0.79);
    const event = requestedEvent(payment.id, order.id, user.id, 'evt-dup-1');

    // Act: primeira entrega processa, segunda (mesmo eventId) é duplicata.
    const first = await worker.processRequestedPayment(event as never);
    const second = await worker.processRequestedPayment(event as never);

    // Assert: efeito de negócio exatamente uma vez.
    expect(first).toMatchObject({ id: payment.id });
    expect(second).toMatchObject({ id: payment.id });
    const finalPayment = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(finalPayment.status).toBe(PaymentStatus.APPROVED);
    const finalOrder = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(finalOrder.status).toBe(OrderStatus.PAID);
    const finalProduct = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    });
    expect(finalProduct.stock).toBe(1);

    // Uma única linha de claim para o eventId.
    await expect(
      prisma.processedEvent.count({ where: { eventId: 'evt-dup-1' } }),
    ).resolves.toBe(1);
    jest.restoreAllMocks();
  });

  it('rejeita reentrada em estado terminal sem mudar nada (T015)', async () => {
    // Arrange: pagamento já aprovado (terminal).
    const { user, order, payment } = await processingFixture('REDELIVERY-2');
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.APPROVED },
    });
    const event = requestedEvent(payment.id, order.id, user.id, 'evt-term-1');

    // Act + Assert: transição inválida é permanente, sem escrita.
    let capturedError: unknown;
    try {
      await worker.processRequestedPayment(event as never);
    } catch (error) {
      capturedError = error;
    }
    expect(capturedError).toBeInstanceOf(NonRetryableError);
    const untouched = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(untouched.status).toBe(PaymentStatus.APPROVED);
    await expect(
      prisma.processedEvent.count({ where: { eventId: 'evt-term-1' } }),
    ).resolves.toBe(0);
  });
});
