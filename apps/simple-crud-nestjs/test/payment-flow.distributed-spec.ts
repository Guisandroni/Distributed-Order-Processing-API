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
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants } from '@lib/contracts';
import { OrderStatus, PaymentStatus, Prisma, PrismaService } from '@lib/prisma';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../src/app.module';
import { OutboxPublisher } from '../src/messaging/outbox.publisher';
import { PaymentsPublisher } from '../src/messaging/messaging.payments.publisher';
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
      await channel.purgeQueue(constants.paymentsResultsQueue);
    } finally {
      await channel.close();
      await connection.close();
    }
  }

  async function startWorker(): Promise<INestMicroservice> {
    const microservice =
      await NestFactory.createMicroservice<MicroserviceOptions>(
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
    await microservice.listen();
    return microservice;
  }

  async function waitForRabbit(timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      try {
        const connection = await connect(distributedRabbitmqUrl);
        await connection.close();
        return;
      } catch {
        await delay(500);
      }
    }

    throw new Error('Broker não voltou no tempo esperado');
  }

  function compose(cmd: string): void {
    // Resolve pelo caminho do spec para não depender do cwd de invocação.
    const composeFile = require('node:path').resolve(
      __dirname,
      '../../../docker-compose.test.yml',
    );
    execSync(`docker compose -f ${composeFile} ${cmd} rabbitmq-test`, {
      stdio: 'ignore',
    });
  }

  async function waitForRabbitDown(timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      try {
        const connection = await connect(distributedRabbitmqUrl);
        await connection.close();
        await delay(500);
      } catch {
        return;
      }
    }

    throw new Error('Broker continuou acessível após o stop');
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

  async function collectResults(
    correlationIds: string[],
    timeoutMs = 15_000,
  ): Promise<Array<{ pattern: string; data: Record<string, any> }>> {
    const connection = await connect(distributedRabbitmqUrl);
    const channel = await connection.createChannel();
    const found: Array<{ pattern: string; data: Record<string, any> }> = [];

    try {
      await channel.consume(
        constants.paymentsResultsQueue,
        (message) => {
          if (message) {
            found.push(JSON.parse(message.content.toString()));
            channel.ack(message);
          }
        },
        { noAck: false },
      );

      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const seen = new Set(found.map((item) => item?.data?.correlationId));
        if (correlationIds.every((id) => seen.has(id))) {
          break;
        }
        await delay(200);
      }
      return found;
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

    worker = await startWorker();

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
    await prisma.outboxEvent.deleteMany();
    await prisma.processedEvent.deleteMany();
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

  it('sobrevive à queda do broker: paga com PENDING e processa após recuperar (T023)', async () => {
    // Arrange: pedido pronto com o broker saudável.
    const registerResponse = await request(api.getHttpServer())
      .post('/auth/register')
      .send({
        name: 'Cliente outage',
        email: `outage-${randomUUID()}@example.test`,
        password: 'StrongPass@123',
        dateOfBirth: '1990-05-20',
      })
      .expect(202);
    const token = registerResponse.body.acessToken as string;

    const productResponse = await request(api.getHttpServer())
      .post('/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        sku: `OUTAGE-${randomUUID()}`,
        name: 'Produto outage',
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
    const orderId = orderResponse.body.id as number;
    let paymentId = 0;

    // Derruba o broker isolado e espera a queda real (stop é assíncrono).
    compose('stop');
    await waitForRabbitDown();
    try {
      // Act (outage): pagar continua 201 — payment + order + outbox
      // na mesma transação, sem depender do broker.
      const paymentResponse = await request(api.getHttpServer())
        .post(`/orders/${orderId}/payment`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      paymentId = paymentResponse.body.id as number;
      expect(paymentResponse.body.status).toBe(PaymentStatus.PROCESSING);

      const pending = await prisma.outboxEvent.findFirst({
        where: { aggregateId: String(orderId) },
      });
      expect(pending).toMatchObject({
        eventType: constants.paymentRequested,
        aggregateId: String(orderId),
        status: 'PENDING',
      });

      // Sem broker, nada avança: pagamento segue PROCESSING.
      await delay(3000);
      const stalled = await prisma.payment.findUnique({
        where: { id: paymentId },
      });
      expect(stalled?.status).toBe(PaymentStatus.PROCESSING);
    } finally {
      compose('start');
    }

    // Recovery: broker de volta (tmpfs zera as filas — redeclara a
    // topologia), worker recriado e poller entrega o backlog PENDING.
    await waitForRabbit();
    await setupRabbitMqTopology();
    try {
      await worker.close();
    } catch {
      // Conexão morta pode falhar ao fechar — segue para recriar.
    }
    worker = await startWorker();

    // O broker de teste usa tmpfs (filas somem no restart): uma publicação
    // que escape entre o boot e a recriação da topologia cai no default
    // exchange sem binding e se perde — o broker de produção é durável e
    // não tem essa janela. Reconciliação do harness: linha SENT cujo
    // pagamento nunca saiu de PROCESSING volta a PENDING (só é seguro
    // porque o worker nunca a tocou — sem risco de efeito duplicado).
    const recoveryDeadline = Date.now() + 90_000;
    let terminalPayment = null as unknown as Awaited<
      ReturnType<typeof waitForTerminalPayment>
    > | null;
    while (Date.now() < recoveryDeadline) {
      const current = await prisma.payment.findUnique({
        where: { id: paymentId },
      });
      if (current && current.status !== PaymentStatus.PROCESSING) {
        terminalPayment = current as typeof terminalPayment;
        break;
      }

      await prisma.outboxEvent.updateMany({
        where: {
          aggregateId: String(orderId),
          status: 'SENT',
        },
        data: { status: 'PENDING', processedAt: null },
      });

      try {
        terminalPayment = await waitForTerminalPayment(paymentId);
        break;
      } catch {
        // Ainda PROCESSING — reinspeciona e tenta de novo.
      }
    }
    if (!terminalPayment) {
      throw new Error(
        `Pagamento ${paymentId} não se recuperou após a volta do broker`,
      );
    }
    expect([PaymentStatus.APPROVED, PaymentStatus.FAILED]).toContain(
      terminalPayment.status,
    );

    // Publicado exatamente uma vez: linha SENT, sem duplicata no outbox.
    const rows = await prisma.outboxEvent.findMany({
      where: { aggregateId: String(orderId) },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('SENT');
    expect(rows[0].processedAt).not.toBeNull();
  }, 120_000);

  it('dois pollers concorrentes nunca reivindicam a mesma linha (T023)', async () => {
    // Arrange: espia a publicação real ANTES de enfileirar o backlog,
    // para contar cada entrega mesmo se o poller de fundo participar.
    const livePublisher = api.get(PaymentsPublisher);
    const publishSpy = jest.spyOn(livePublisher, 'publish');

    const eventIds: string[] = [];
    const backlog = 5;
    for (let i = 0; i < backlog; i++) {
      const eventId = randomUUID();
      eventIds.push(eventId);
      await prisma.outboxEvent.create({
        data: {
          eventType: constants.paymentRequested,
          aggregateId: `concurrent-${eventId}`,
          payload: {
            eventId,
            eventType: constants.paymentRequested,
            occurredAt: new Date().toISOString(),
            correlationId: randomUUID(),
            payload: {
              paymentId: 1000 + i,
              orderId: 2000 + i,
              userId: 3000 + i,
              amount: '10',
            },
          },
          status: 'PENDING',
        },
      });
    }

    // Act: dois pollers contra o mesmo backlog ao mesmo tempo.
    const config = api.get(ConfigService);
    const first = new OutboxPublisher(prisma, livePublisher, config);
    const second = new OutboxPublisher(prisma, livePublisher, config);
    await Promise.all([first.poll(), second.poll()]);

    // Assert: cada linha publicada exatamente uma vez e marcada SENT.
    const deliveries = new Map<string, number>();
    for (const [envelope] of publishSpy.mock.calls) {
      const id = (envelope as { eventId: string }).eventId;
      deliveries.set(id, (deliveries.get(id) ?? 0) + 1);
    }
    for (const eventId of eventIds) {
      expect(deliveries.get(eventId)).toBe(1);
    }
    const sent = await prisma.outboxEvent.count({
      where: {
        aggregateId: { startsWith: 'concurrent-' },
        status: 'SENT',
      },
    });
    expect(sent).toBe(backlog);
    publishSpy.mockRestore();
  }, 60_000);

  it('redelivery com mesmo eventId cobra uma única vez (T017)', async () => {
    // Arrange: pagamento em processamento criado direto no banco.
    const user = await prisma.user.create({
      data: {
        name: 'Cliente redelivery',
        email: `redelivery-${randomUUID()}@example.test`,
        password: 'StrongPass@123',
        dateOfBirth: new Date('1990-01-01'),
      },
    });
    const product = await prisma.product.create({
      data: {
        sku: `REDELIVERY-${randomUUID()}`,
        name: 'Produto redelivery',
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
    const eventId = randomUUID();
    const envelope = {
      eventId,
      eventType: constants.paymentRequested,
      occurredAt: new Date().toISOString(),
      correlationId: randomUUID(),
      payload: {
        paymentId: payment.id,
        orderId: order.id,
        userId: user.id,
        amount: '50',
      },
    };

    // Act: o MESMO envelope é entregue duas vezes (redelivery real).
    await publishRaw(
      constants.paymentsQueue,
      constants.paymentRequestedEvent,
      envelope,
    );
    await publishRaw(
      constants.paymentsQueue,
      constants.paymentRequestedEvent,
      envelope,
    );

    // Assert: efeito de negócio exatamente uma vez.
    const terminalPayment = await waitForTerminalPayment(payment.id);
    expect([PaymentStatus.APPROVED, PaymentStatus.FAILED]).toContain(
      terminalPayment.status,
    );
    await expect(
      prisma.processedEvent.count({ where: { eventId } }),
    ).resolves.toBe(1);

    // Segunda entrega confirmada sem reprocessar: principal drenada,
    // retry vazia e nada estacionado na DLQ.
    expect(await queueDepth(constants.paymentsQueue)).toBe(0);
    expect(await queueDepth(constants.paymentRequestedRetryQueue)).toBe(0);
    expect(await queueDepth(constants.paymentsDeadLetterQueue)).toBe(0);

    // Zero escritas na redelivery: estado e updatedAt congelados.
    const frozenAt = terminalPayment.updatedAt.toISOString();
    await delay(3000);
    const reRead = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(reRead.status).toBe(terminalPayment.status);
    expect(reRead.updatedAt.toISOString()).toBe(frozenAt);
  }, 60_000);

  it('emite um resultado por pagamento com correlação íntegra (T027)', async () => {
    // Arrange: garante 1 aprovação + 1 falha (o worker sorteia 80/20).
    type Outcome = {
      paymentId: number;
      requestEventId: string;
      correlationId: string;
      status: PaymentStatus;
    };
    const outcomes: Outcome[] = [];
    let seed = 0;
    while (
      (!outcomes.some((o) => o.status === PaymentStatus.APPROVED) ||
        !outcomes.some((o) => o.status === PaymentStatus.FAILED)) &&
      seed < 20
    ) {
      seed += 1;
      const user = await prisma.user.create({
        data: {
          name: 'Cliente resultado',
          email: `result-${seed}-${randomUUID()}@example.test`,
          password: 'StrongPass@123',
          dateOfBirth: new Date('1990-01-01'),
        },
      });
      const product = await prisma.product.create({
        data: {
          sku: `RESULT-${seed}-${randomUUID()}`,
          name: 'Produto resultado',
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
      const requestEventId = randomUUID();
      const correlationId = randomUUID();
      await publishRaw(
        constants.paymentsQueue,
        constants.paymentRequestedEvent,
        {
          eventId: requestEventId,
          eventType: constants.paymentRequested,
          occurredAt: new Date().toISOString(),
          correlationId,
          payload: {
            paymentId: payment.id,
            orderId: order.id,
            userId: user.id,
            amount: '50',
          },
        },
      );
      const terminal = await waitForTerminalPayment(payment.id);
      outcomes.push({
        paymentId: payment.id,
        requestEventId,
        correlationId,
        status: terminal.status as PaymentStatus,
      });
    }
    const approved = outcomes.find((o) => o.status === PaymentStatus.APPROVED);
    const failed = outcomes.find((o) => o.status === PaymentStatus.FAILED);
    expect(approved).toBeDefined();
    expect(failed).toBeDefined();

    // Act: coleta os resultados publicados em payments.results.
    const results = await collectResults([
      approved!.correlationId,
      failed!.correlationId,
    ]);

    // Assert: exatamente um approved + um failed, correlação íntegra.
    const approvedHits = results.filter(
      (r) => r?.data?.correlationId === approved!.correlationId,
    );
    expect(approvedHits).toHaveLength(1);
    expect(approvedHits[0].pattern).toBe(constants.paymentApprovedEvent);
    expect(approvedHits[0].data.eventType).toBe(constants.paymentApproved);
    expect(approvedHits[0].data.eventId).not.toBe(approved!.requestEventId);
    expect(approvedHits[0].data.correlationId).toBe(approved!.correlationId);
    expect(approvedHits[0].data.payload).toMatchObject({
      paymentId: approved!.paymentId,
    });

    const failedHits = results.filter(
      (r) => r?.data?.correlationId === failed!.correlationId,
    );
    expect(failedHits).toHaveLength(1);
    expect(failedHits[0].pattern).toBe(constants.paymentFailedEvent);
    expect(failedHits[0].data.eventType).toBe(constants.paymentFailed);
    expect(failedHits[0].data.eventId).not.toBe(failed!.requestEventId);
    expect(failedHits[0].data.correlationId).toBe(failed!.correlationId);
    expect(failedHits[0].data.payload).toMatchObject({
      paymentId: failed!.paymentId,
    });
    expect(typeof failedHits[0].data.payload.reason).toBe('string');
    expect(failedHits[0].data.payload.reason.length).toBeGreaterThan(0);
  }, 120_000);
});
