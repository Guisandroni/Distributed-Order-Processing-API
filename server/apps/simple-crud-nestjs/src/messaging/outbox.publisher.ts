import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '@lib/prisma';
import { constants, DomainEvent, NonRetryableError } from '@lib/contracts';
import { PaymentsPublisher } from './messaging.payments.publisher';

type OutboxRow = {
  id: string;
  eventType: string;
  aggregateId: string;
  payload: unknown;
  attempts: number;
};

const SUPPORTED_EVENT_TYPES = new Set([constants.paymentRequested]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Valida o envelope antes de publicar: linha corrompida vira
// NonRetryableError — logada, retida para inspeção do operador,
// nunca publicada e nunca repetida indefinidamente (data-model.md).
function toPublishableEnvelope(row: OutboxRow): DomainEvent<unknown> {
  const fail = (reason: string): never => {
    throw new NonRetryableError(
      `OutboxEvent ${row.id} inválido (${reason}) — retido para inspeção`,
    );
  };

  if (!isRecord(row.payload)) return fail('payload não-objeto');
  const envelope = row.payload as Record<string, unknown>;

  if (typeof envelope.eventId !== 'string' || !envelope.eventId) {
    return fail('eventId ausente');
  }
  if (typeof envelope.eventType !== 'string' || !envelope.eventType) {
    return fail('eventType ausente');
  }
  if (!SUPPORTED_EVENT_TYPES.has(envelope.eventType as string)) {
    return fail(`eventType não suportado: ${String(envelope.eventType)}`);
  }
  if (typeof envelope.occurredAt !== 'string' || !envelope.occurredAt) {
    return fail('occurredAt ausente');
  }
  if (typeof envelope.correlationId !== 'string' || !envelope.correlationId) {
    return fail('correlationId ausente');
  }
  if (!isRecord(envelope.payload)) return fail('payload do evento ausente');

  if (envelope.eventType === constants.paymentRequested) {
    const inner = envelope.payload as Record<string, unknown>;
    if (
      typeof inner.paymentId !== 'number' ||
      typeof inner.orderId !== 'number' ||
      typeof inner.userId !== 'number' ||
      typeof inner.amount !== 'string'
    ) {
      return fail('payload de payment.requested inválido');
    }
  }

  return envelope as unknown as DomainEvent<unknown>;
}

@Injectable()
export class OutboxPublisher {
  private readonly logger = new Logger(OutboxPublisher.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentsPublisher: PaymentsPublisher,
    private readonly config: ConfigService,
  ) {}

  // Intervalo via OUTBOX_POLL_MS (default 5000, topology.md).
  @Interval(Number(process.env.OUTBOX_POLL_MS ?? 5000))
  async poll(): Promise<void> {
    const batch =
      Number(this.config.get<string>('OUTBOX_BATCH_SIZE') ?? '20') || 20;

    // Reivindicação concorrente-segura: a transação segura as linhas
    // com FOR UPDATE SKIP LOCKED, então dois pollers nunca publicam
    // a mesma linha — o segundo simplesmente não enxerga a linha travada.
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<OutboxRow[]>`
        SELECT id, "eventType", "aggregateId", payload, attempts
        FROM "OutboxEvent"
        WHERE status::text = 'PENDING'
        ORDER BY "createdAt" ASC
        LIMIT ${batch}
        FOR UPDATE SKIP LOCKED
      `;

      for (const row of rows) {
        let envelope: DomainEvent<unknown>;
        try {
          envelope = toPublishableEnvelope(row);
        } catch (error) {
          this.logger.error(error);
          continue;
        }

        try {
          await this.paymentsPublisher.publish(envelope);
          await tx.outboxEvent.update({
            where: { id: row.id },
            data: { status: 'SENT', processedAt: new Date() },
          });
        } catch (error) {
          this.logger.warn(
            `OutboxEvent ${row.id} falhou (attempt ${row.attempts + 1}): ${(error as Error).message}`,
          );
          await tx.outboxEvent.update({
            where: { id: row.id },
            data: { attempts: { increment: 1 } },
          });
        }
      }
    });
  }
}
