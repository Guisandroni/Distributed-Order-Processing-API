# Data Model: RabbitMQ Reliability + Transactional Outbox

**Date**: 2026-09-13 | **Spec**: [spec.md](spec.md) | **Research**: [research.md](research.md)

Two new persistent entities. Existing `Payment` / `Order` models gain no new
columns — state-machine enforcement is code-level (guards in
`PaymentWorkerService`), keeping the migration to the two tables below.

## ProcessedEvent — idempotency claim (FR-007)

```prisma
model ProcessedEvent {
  id          String   @id @default(uuid())
  eventId     String   @unique
  eventType   String
  processedAt DateTime @default(now())

  @@index([eventType])
}
```

- **Source of `eventId`**: the `DomainEvent` envelope the API already emits
  (`randomUUID` per `payment.requested`); result events mint their own.
- **Write rule**: inserted inside the worker's approve/fail `$transaction`,
  before business writes. Unique-violation ⇒ duplicate delivery ⇒ roll back
  the claim attempt, ack, return current payment untouched.
- **No delete/TTL in this phase**: the table is the audit trail answering
  "was this event handled?" (SC-006). Retention is a later-phase concern.
- **Validation**: `eventId` unique (DB-enforced, the race arbiter);
  `eventType` required for per-type inspection.

## OutboxEvent — durable outbound intent (FR-010, FR-011)

```prisma
enum OutboxStatus {
  PENDING
  SENT
}

model OutboxEvent {
  id          String       @id @default(uuid())
  eventType   String
  aggregateId String
  payload     Json
  status      OutboxStatus @default(PENDING)
  attempts    Int          @default(0)
  createdAt   DateTime     @default(now())
  processedAt DateTime?

  @@index([status])
  @@index([createdAt])
}
```

- **Write rule**: created in the same `$transaction` as payment + order
  update in `PaymentsService.process` (`aggregateId` = order id as string,
  `payload` = full `DomainEvent` envelope JSON). Commit-then-publish without
  the row is forbidden.
- **Publisher transitions**: `PENDING → SENT` (sets `processedAt`,
  publishes once); failed publish keeps `PENDING`, increments `attempts`.
  Claiming under concurrency via `SELECT … FOR UPDATE SKIP LOCKED` (or an
  atomic status-claim update) — never two publishers sending the same row.
- **Validation**: `attempts >= 0`; `processedAt` set iff `status == SENT`;
  `payload` MUST validate as the envelope for `eventType` before publish
  (corrupt row ⇒ `NonRetryableError`, logged, left for operator — never
  silently dropped).

## Payment state machine (FR-008, code-enforced)

```text
PROCESSING ── success ──▶ APPROVED   (terminal)
PROCESSING ── permanent failure ──▶ FAILED   (terminal)
APPROVED ──✕──▶ PROCESSING   (rejected, state unchanged)
FAILED   ──✕──▶ PROCESSING   (rejected, state unchanged)
```

- Guards live in `PaymentWorkerService` (keep the existing early-return on
  non-`PROCESSING`); invalid transitions raise `NonRetryableError` so the
  message goes to DLQ with a logged reason instead of retrying forever.
- `Order` follows payment terminality as today (`APPROVED→PAID`,
  `FAILED→FAILED` + stock restore); no order-schema change.

## Relationships

```text
Order 1 ─── 0..1 Payment 1 ─── * OutboxEvent (aggregateId = order id)
DomainEvent * ─── 0..1 ProcessedEvent (eventId, claimed by worker tx)
```

`ProcessedEvent` and `OutboxEvent` reference domain rows by id values only
(no Prisma relations): they are infrastructure records and MUST NOT couple
migrations or cascade-deletes to the domain tables.
