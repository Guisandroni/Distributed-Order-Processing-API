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
import { constants } from '@lib/contracts';
import { OrderStatus, PaymentStatus, PrismaService } from '@lib/prisma';
import { AppModule } from '../src/app.module';
import { PaymentWorkerModule } from '../../payment-worker/src/payment-worker.module';

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

  async function purgePaymentQueue(): Promise<void> {
    const connection = await connect(distributedRabbitmqUrl);
    const channel = await connection.createChannel();

    try {
      await channel.assertQueue(constants.paymentsQueue, { durable: true });
      await channel.purgeQueue(constants.paymentsQueue);
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

  beforeAll(async () => {
    process.env.DATABASE_URL = distributedDatabaseUrl;
    process.env.JWT_SECRET = 'distributed-e2e-secret-key';
    process.env.RABBITMQ_URL = distributedRabbitmqUrl;

    await purgePaymentQueue();

    worker = await NestFactory.createMicroservice<MicroserviceOptions>(
      PaymentWorkerModule,
      {
        transport: Transport.RMQ,
        options: {
          urls: [rabbitmqUrl],
          queue: constants.paymentsQueue,
          queueOptions: { durable: true },
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
});
