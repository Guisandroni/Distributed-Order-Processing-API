import {
  INestApplication,
  INestMicroservice,
  ValidationPipe,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { connect } from 'amqplib';
import request from 'supertest';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { constants } from '@lib/contracts';
import { OrderStatus, PaymentStatus, Prisma, PrismaService } from '@lib/prisma';
import { AppModule } from '../src/app.module';
import { PaymentWorkerModule } from '../../payment-worker/src/payment-worker.module';
import { setupRabbitMqTopology } from '../../payment-worker/src/rabbitmq/setup-rabbitmq-topology';

const databaseUrl = process.env.DATABASE_URL_TEST;
const rabbitmqUrl = process.env.RABBITMQ_URL_TEST;

if (
  !databaseUrl ||
  !databaseUrl.includes('order_platform_test') ||
  !databaseUrl.includes(':2021/')
) {
  throw new Error(
    'DATABASE_URL_TEST deve apontar para order_platform_test na porta 2021',
  );
}

if (!rabbitmqUrl || !rabbitmqUrl.includes(':5673')) {
  throw new Error('RABBITMQ_URL_TEST deve apontar para a porta isolada 5673');
}

const distributedDatabaseUrl = databaseUrl;
const distributedRabbitmqUrl = rabbitmqUrl;

jest.setTimeout(30_000);

describe('API → RabbitMQ → Worker → PostgreSQL (distributed e2e)', () => {
  let api: INestApplication;
  let worker: INestMicroservice;
  let prisma: PrismaService;

  async function purgeReliabilityQueues(): Promise<void> {
    const connection = await connect(distributedRabbitmqUrl);
    const channel = await connection.createChannel();

    try {
      // Filas já declaradas pelo setup de topologia; purga sem redeclarar
      // para não conflitar com os argumentos (TTL/DLX) da retry queue.
      await channel.purgeQueue(constants.paymentsQueue);
      await channel.purgeQueue(constants.paymentRequestedRetryQueue);
      await channel.purgeQueue(constants.paymentsDeadLetterQueue);
    } finally {
      await channel.close();
      await connection.close();
    }
  }

  async function waitForTerminalPayment(paymentId: number) {
    const deadline = Date.now() + 15_000;

    while (Date.now() < deadline) {
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
        include: {
          order: {
            include: { items: true },
          },
        },
      });

      if (payment && payment.status !== PaymentStatus.PROCESSING) {
        return payment;
      }

      await delay(100);
    }

    throw new Error(`Pagamento ${paymentId} não foi processado pelo worker`);
  }

  function requestedEnvelope(paymentId: number) {
    return {
      eventId: randomUUID(),
      eventType: constants.paymentRequested,
      occurredAt: new Date().toISOString(),
      correlationId: randomUUID(),
      payload: { paymentId, orderId: 0, userId: 0, amount: '0' },
    };
  }

  async function publishRaw(
    queue: string,
    pattern: string,
    data: unknown,
  ): Promise<void> {
    const connection = await connect(distributedRabbitmqUrl);
    const channel = await connection.createChannel();

    try {
      // Mesmo formato de fio do ClientProxy RMQ: { pattern, data }.
      channel.sendToQueue(
        queue,
        Buffer.from(JSON.stringify({ pattern, data })),
        { persistent: true },
      );
    } finally {
      await channel.close();
      await connection.close();
    }
  }

  async function waitForDlqMessage(timeoutMs = 10_000): Promise<{
    pattern: string;
    data: { payload: { paymentId: number } };
    headers: Record<string, unknown>;
  }> {
    const deadline = Date.now() + timeoutMs;
    const connection = await connect(distributedRabbitmqUrl);
    const channel = await connection.createChannel();

    try {
      while (Date.now() < deadline) {
        const message = await channel.get(constants.paymentsDeadLetterQueue);

        if (message) {
          const parsed = JSON.parse(message.content.toString()) as {
            pattern: string;
            data: { payload: { paymentId: number } };
          };
          const headers = (message.properties.headers ?? {}) as Record<
            string,
            unknown
          >;
          channel.ack(message);
          return { ...parsed, headers };
        }

        await delay(200);
      }

      throw new Error('Nenhuma mensagem chegou à DLQ no tempo esperado');
    } finally {
      await channel.close();
      await connection.close();
    }
  }

  async function queueDepth(queue: string): Promise<number> {
    const connection = await connect(distributedRabbitmqUrl);
    const channel = await connection.createChannel();

    try {
      const status = await channel.checkQueue(queue);
      return status.messageCount;
    } finally {
      await channel.close();
      await connection.close();
    }
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = distributedDatabaseUrl;
    process.env.JWT_SECRET = 'distributed-e2e-secret-key';
    process.env.RABBITMQ_URL = distributedRabbitmqUrl;

    // Declara a topologia de produção (retry + DLQ + resultados) no broker
    // isolado antes de qualquer consumer ou purga.
    await setupRabbitMqTopology();
    await purgeReliabilityQueues();

    worker = await NestFactory.createMicroservice<MicroserviceOptions>(
      PaymentWorkerModule,
      {
        transport: Transport.RMQ,
        options: {
          urls: [rabbitmqUrl],
          queue: constants.paymentsQueue,
          // Mesmos argumentos do setup: re-declarar sem eles quebraria o
          // canal com PRECONDITION_FAILED.
          queueOptions: {
            durable: true,
            arguments: {
              'x-dead-letter-exchange': constants.paymentsDeadLetterExchange,
              'x-dead-letter-routing-key':
                constants.paymentsDeadLetterRoutingKey,
            },
          },
          noAck: false,
        },
      },
    );
    await worker.listen();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    api = moduleFixture.createNestApplication();
    api.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await api.init();
    prisma = api.get(PrismaService);
  });

  beforeEach(async () => {
    await purgeReliabilityQueues();
    await prisma.payment.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.product.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await api.close();
    await worker.close();
  });

  it('entrega o evento publicado pela API ao worker real', async () => {
    const registerResponse = await request(api.getHttpServer())
      .post('/auth/register')
      .send({
        name: 'Cliente distribuído',
        email: 'distributed-flow@example.test',
        password: 'StrongPass@123',
        dateOfBirth: '1990-05-20',
      })
      .expect(202);
    const token = registerResponse.body.acessToken as string;

    const productResponse = await request(api.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sku: 'DISTRIBUTED-E2E',
        name: 'Produto distribuído',
        price: 25,
        stock: 3,
      })
      .expect(201);

    const orderResponse = await request(api.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ productId: productResponse.body.id, quantity: 2 }],
      })
      .expect(201);

    const paymentResponse = await request(api.getHttpServer())
      .post(`/orders/${orderResponse.body.id}/payment`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    expect(paymentResponse.body.status).toBe(PaymentStatus.PROCESSING);

    const terminalPayment = await waitForTerminalPayment(
      paymentResponse.body.id as number,
    );

    expect([PaymentStatus.APPROVED, PaymentStatus.FAILED]).toContain(
      terminalPayment.status,
    );
    expect(terminalPayment).toMatchObject({
      id: paymentResponse.body.id,
      orderId: orderResponse.body.id,
    });
    expect(terminalPayment.amount.toString()).toBe('50');

    const finalProductResponse = await request(api.getHttpServer())
      .get(`/products/${productResponse.body.id}`)
      .expect(200);

    if (terminalPayment.status === PaymentStatus.APPROVED) {
      expect(terminalPayment.order.status).toBe(OrderStatus.PAID);
      expect(finalProductResponse.body.stock).toBe(1);
    } else {
      expect(terminalPayment.order.status).toBe(OrderStatus.FAILED);
      expect(finalProductResponse.body.stock).toBe(3);
    }
  });

  it('retorna da retry queue após o TTL e conclui o pagamento com ACK', async () => {
    // Arrange: pagamento PROCESSING criado direto no banco; o evento entra
    // pela retry queue simulando o retorno de uma expiração de TTL.
    const user = await prisma.user.create({
      data: {
        name: 'Cliente retry',
        email: `retry-${randomUUID()}@example.test`,
        password: 'StrongPass@123',
        dateOfBirth: new Date('1990-01-01'),
      },
    });
    const product = await prisma.product.create({
      data: {
        sku: `RETRY-${randomUUID()}`,
        name: 'Produto retry',
        price: new Prisma.Decimal('25'),
        stock: 3,
      },
    });
    const order = await prisma.order.create({
      data: {
        status: OrderStatus.PROCESSING,
        total: new Prisma.Decimal('50'),
        userId: user.id,
      },
    });
    await prisma.orderItem.create({
      data: {
        orderId: order.id,
        productId: product.id,
        quantity: 2,
        unitPrice: new Prisma.Decimal('25'),
      },
    });
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        amount: new Prisma.Decimal('50'),
        status: PaymentStatus.PROCESSING,
      },
    });
    await publishRaw(
      constants.paymentRequestedRetryQueue,
      constants.paymentRequestedEvent,
      requestedEnvelope(payment.id),
    );

    // Act: o TTL devolve para a fila principal e o worker processa.
    const terminalPayment = await waitForTerminalPayment(payment.id);

    // Assert: estado terminal e filas drenadas (ACK em todas as entregas).
    expect([PaymentStatus.APPROVED, PaymentStatus.FAILED]).toContain(
      terminalPayment.status,
    );
    expect(await queueDepth(constants.paymentsQueue)).toBe(0);
    expect(await queueDepth(constants.paymentRequestedRetryQueue)).toBe(0);
  });

  it('estaciona na DLQ mensagem com pagamento inexistente', async () => {
    // Arrange: ID inexistente é falha permanente determinística.
    await publishRaw(
      constants.paymentsQueue,
      constants.paymentRequestedEvent,
      requestedEnvelope(999999),
    );

    // Act: o worker rejeita sem requeue e a DLX roteia para a DLQ.
    const dead = await waitForDlqMessage();

    // Assert: identidade preservada, histórico de morte presente, principal drenada.
    expect(dead.pattern).toBe(constants.paymentRequestedEvent);
    expect(dead.data.payload.paymentId).toBe(999999);
    expect(dead.headers['x-death']).toBeDefined();
    expect(await queueDepth(constants.paymentsQueue)).toBe(0);
  });
});
