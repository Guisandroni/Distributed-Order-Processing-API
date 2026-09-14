# Research: RabbitMQ Reliability + Transactional Outbox

**Date**: 2026-09-13 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

All unknowns from Technical Context resolved against the repo (NestJS 11,
RabbitMQ 4 `rabbitmq:4-management`, Prisma 7 + PostgreSQL 17) and the PRD.
No open NEEDS CLARIFICATION remains.

## R-1: Retry via TTL + DLX (no broker plugin)

- **Decision**: Classic `payment.requested.retry` queue with `x-message-ttl`
  (from `RETRY_TTL_MS`, default 5000) and dead-letter args pointing back at
  the main queue; worker rejects retryable failures with `nack(..., false,
  false)` after republishing to the retry queue (or dead-lettering into it —
  see R-2). `requeue=true` is banned everywhere.
- **Rationale**: Works on the stock `rabbitmq:4-management` image with zero
  plugins; delay is infrastructure-level (no blocked worker, per FR-006);
  topology is declared in the existing `setupRabbitMqTopology` + Nest
  `queueOptions`, same pattern as the current DLQ wiring.
- **Alternatives considered**: `rabbitmq_delayed_message_exchange` plugin —
  rejected (custom image build, ops surface, later-phase concern);
  quorum queues — rejected (no per-message TTL semantics needed, classic
  matches existing topology); in-worker `setTimeout` — forbidden by PRD.

## R-2: Attempt counting via `x-death` header

- **Decision**: Read attempts from the raw AMQP message
  (`RmqContext.getMessage().properties.headers['x-death']`: count entries
  where `queue == paymentsQueue`); attempts ≥ `MAX_RETRIES` (3, env
  `MAX_RETRIES`) ⇒ reject to DLQ, else route to retry queue. Log every
  decision with attempt number.
- **Rationale**: Infrastructure-native, survives worker restarts, no extra
  DB write per attempt; raw message stays accessible beside Nest's
  `@Payload()` deserialization (already used for `ack`/`nack` today).
- **Alternatives considered**: Persisting attempts on the Payment row —
  rejected (mixes transport state into domain state, extra writes, races
  with redelivery); `x-delivery-count` (quorum-only) — rejected per R-1.

## R-3: Idempotency as transactional claim on envelope `eventId`

- **Decision**: `ProcessedEvent(eventId UNIQUE)` inserted inside the same
  `$transaction` as the approve/fail writes, using the envelope `eventId`
  the API already generates (`randomUUID`) and the worker already logs.
  Unique-violation ⇒ duplicate ⇒ ack without business writes. Check-then-act
  outside a tx is forbidden (race under redelivery + outbox overlap).
- **Rationale**: The envelope identity already flows end-to-end; the claim
  piggybacks the existing worker transaction (Principle II, zero new
  round-trips on the happy path); PostgreSQL uniqueness is the arbiter under
  concurrent duplicate delivery.
- **Alternatives considered**: Redis idempotency keys — rejected (PRD keeps
  PostgreSQL authoritative for financial consistency; Redis arrives next
  phase); in-memory seen-set — rejected (lost on restart, breaks with
  ≥2 worker replicas).

## R-4: Error taxonomy as shared error classes

- **Decision**: `RetryableError` / `NonRetryableError` in
  `libs/contracts/src/processing-errors.ts`. Worker service throws
  `NonRetryableError` for not-found / invalid payload / invalid transition /
  business-rule violations; unexpected errors (timeouts, connection resets,
  broker errors) default to retryable. Consumer maps: non-retryable ⇒ DLQ;
  retryable + attempts left ⇒ retry queue; retryable + exhausted ⇒ DLQ.
- **Rationale**: Classification lives with the code that knows the failure
  (service), routing lives with the code that knows the transport
  (consumer) — matches "unit owns reason, boundary owns effect"; shared lib
  keeps API and worker consistent (Principle I).
- **Alternatives considered**: Boolean return codes — rejected (loses reason
  in logs); classifying in the consumer by message inspection — rejected
  (consumer can't distinguish timeout from bad payload reliably).

## R-5: Outbox publisher as API-side scheduled poller

- **Decision**: `OutboxPublisher` in `simple-crud-nestjs` (`messaging/`),
  `@Interval` from `@nestjs/schedule` (new dep, gated in plan.md), claiming
  a batch with `SELECT … FOR UPDATE SKIP LOCKED` (or atomic
  status-claim update) to stay safe under concurrent instances; success ⇒
  `SENT` + `processedAt`, failure ⇒ attempts++ stay `PENDING`. Poll interval
  (`OUTBOX_POLL_MS`, default 5000) and batch size env-configurable.
- **Rationale**: The API owns the write path and the existing
  `PaymentsPublisher`; a scheduled provider reuses Nest lifecycle/shutdown
  instead of a new deployment unit; `SKIP LOCKED` is the standard
  multi-poller claim on PostgreSQL.
- **Alternatives considered**: Hand-rolled `setInterval` — rejected (no DI /
  lifecycle / graceful shutdown); separate poller process — rejected (new
  deployable for later phases); LISTEN/NOTIFY push — rejected (still needs a
  poll fallback for crash recovery; keep one mechanism).

## R-6: Result events emitted by worker, asserted in tests

- **Decision**: Worker emits `payment.approved` / `payment.failed`
  (`DomainEvent` envelope, new `eventId`, propagated `correlationId`) via a
  `ClientProxy` emit client registered in `PaymentWorkerModule`, to a durable
  `payments.results` queue declared in topology setup. No consumer ships in
  this phase; distributed E2E binds an assertion consumer to prove
  publication (FR-012, SC-005).
- **Rationale**: Symmetric with the existing API→worker emit path; keeps the
  phase's contract ("publish + test") without inventing a consumer the
  observability phase will design properly.
- **Alternatives considered**: Direct `amqplib` publish in worker service —
  rejected (bypasses Nest transport config, harder to stub in unit tests);
  skipping the results queue (fire-and-forget exchange) — rejected
  (undeliverable results would vanish silently; durable queue preserves them
  for the next phase's consumer).
