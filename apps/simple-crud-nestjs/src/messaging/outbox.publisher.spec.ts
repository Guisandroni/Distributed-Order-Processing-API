import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@lib/prisma';
import { NonRetryableError } from '@lib/contracts';
import { PaymentsPublisher } from './messaging.payments.publisher';
import { OutboxPublisher } from './outbox.publisher';

describe('OutboxPublisher (T019)', () => {
  let publisher: OutboxPublisher;

  const txMock = {
    $queryRaw: jest.fn(),
    outboxEvent: {
      update: jest.fn(),
    },
  };

  const prismaMock = {
    $transaction: jest.fn(),
  };

  const paymentsPublisherMock = {
    publish: jest.fn(),
  };

  const configMock = {
    get: jest.fn((key: string, fallback?: string) => fallback),
  };

  const validEnvelope = {
    eventId: 'evt-1',
    eventType: 'payment.requested',
    occurredAt: new Date().toISOString(),
    correlationId: 'corr-1',
    payload: { paymentId: 30, orderId: 8, userId: 7, amount: '26' },
  };

  function pendingRow(overrides = {}) {
    return {
      id: 'row-1',
      eventType: 'payment.requested',
      aggregateId: '8',
      payload: validEnvelope,
      attempts: 0,
      ...overrides,
    };
  }

  beforeEach(async () => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof txMock) => Promise<unknown>) =>
        callback(txMock),
    );
    configMock.get.mockImplementation((key: string, fallback?: string) => {
      if (key === 'OUTBOX_BATCH_SIZE') return '20';
      if (key === 'OUTBOX_POLL_MS') return '5000';
      return fallback;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxPublisher,
        { provide: PrismaService, useValue: prismaMock },
        { provide: PaymentsPublisher, useValue: paymentsPublisherMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    publisher = module.get<OutboxPublisher>(OutboxPublisher);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('publica lote PENDING e marca SENT com processedAt (T019)', async () => {
    // Arrange: uma linha PENDING com envelope válido esperando no outbox.
    txMock.$queryRaw.mockResolvedValue([pendingRow()]);
    paymentsPublisherMock.publish.mockResolvedValue(undefined);

    // Act: o poller reivindica e publica.
    await publisher.poll();

    // Assert: reivindicação concorrente-segura e publicação única.
    expect(txMock.$queryRaw).toHaveBeenCalledTimes(1);
    const [query] = txMock.$queryRaw.mock.calls[0] as unknown as string[];
    expect(String(query)).toContain('SKIP LOCKED');
    expect(paymentsPublisherMock.publish).toHaveBeenCalledTimes(1);
    expect(paymentsPublisherMock.publish).toHaveBeenCalledWith(validEnvelope);

    // Sucesso ⇒ SENT + processedAt, sem inflar attempts.
    expect(txMock.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'row-1' },
      data: expect.objectContaining({ status: 'SENT' }),
    });
    const sentData = txMock.outboxEvent.update.mock.calls[0][0].data;
    expect(sentData.processedAt).toBeInstanceOf(Date);
  });

  it('falha de publish mantém PENDING e incrementa attempts (T019)', async () => {
    // Arrange: o broker cai no meio da publicação.
    txMock.$queryRaw.mockResolvedValue([pendingRow()]);
    paymentsPublisherMock.publish.mockRejectedValue(
      new Error('broker unavailable'),
    );

    // Act: o poller tenta e registra a tentativa sem perder a linha.
    await publisher.poll();

    // Assert: linha retida como PENDING com attempts + 1, nunca SENT.
    expect(txMock.outboxEvent.update).toHaveBeenCalledWith({
      where: { id: 'row-1' },
      data: { attempts: { increment: 1 } },
    });
    const updateData = txMock.outboxEvent.update.mock.calls[0][0].data;
    expect(updateData.status).not.toBe('SENT');
  });

  it.each([
    ['envelope nulo', null],
    ['envelope string corrompida', 'not-json{{{'],
    ['tipo não suportado', { ...validEnvelope, eventType: 'order.cancelled' }],
    ['payload inválido', { ...validEnvelope, payload: { paymentId: 'NaN' } }],
    ['sem eventId', { ...validEnvelope, eventId: undefined }],
  ])(
    'linha corrompida (%s) é NonRetryableError: logada, retida, nunca publicada (T019)',
    async (_label, corruptPayload) => {
      // Arrange: linha ilegível ou com tipo/payload inválido.
      txMock.$queryRaw.mockResolvedValue([
        pendingRow({ payload: corruptPayload }),
      ]);

      // Act: o poller valida antes de publicar.
      await publisher.poll();

      // Assert: nada é publicado nem marcado SENT; erro classificado e logado.
      expect(paymentsPublisherMock.publish).not.toHaveBeenCalled();
      const sentCalls = txMock.outboxEvent.update.mock.calls.filter(
        ([args]: [{ data: Record<string, unknown> }]) =>
          (args.data as Record<string, unknown>).status === 'SENT',
      );
      expect(sentCalls).toHaveLength(0);
      expect(Logger.prototype.error).toHaveBeenCalled();
      const logged = (Logger.prototype.error as jest.Mock).mock.calls.flat();
      expect(
        logged.some(
          (arg) =>
            arg instanceof NonRetryableError ||
            (typeof arg === 'string' && arg.includes('NonRetryableError')),
        ),
      ).toBe(true);
    },
  );
});
