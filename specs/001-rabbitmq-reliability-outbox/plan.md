# Implementation Plan: RabbitMQ Reliability + Transactional Outbox

**Branch**: `001-rabbitmq-reliability-outbox` | **Date**: 2026-09-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-rabbitmq-reliability-outbox/spec.md`
(PRD `docs/PRD/prd02.md`, Fase 12 / Issue #12, sections 4–13).

## Summary

Make payment messaging reliable without adding new infrastructure: a TTL-based
retry queue with `MAX_RETRIES = 3` before DLQ, a `RetryableError` /
`NonRetryableError` taxonomy, DB-backed idempotency on the existing envelope
`eventId`, a formalized payment state machine, `payment.approved` /
`payment.failed` result events, and a Transactional Outbox
(`OutboxEvent` + publisher) closing the commit-then-publish hole in
`PaymentsService.process`. Approach per `research.md`: infrastructure-native
retry (classic queue + `x-message-ttl` + DLX, no broker plugin), `x-death`
attempt counting, transactional idempotency claim, and a `ScheduleModule`
outbox poller with `SKIP LOCKED` claiming.

## Technical Context

**Language/Version**: TypeScript strict, Node.js, NestJS 11 monorepo
(`apps/*`, `libs/*`, pnpm workspaces).

**Primary Dependencies**: `@nestjs/microservices` (RMQ transport), `amqplib`
(topology setup), `@lib/prisma` (Prisma 7 + `adapter-pg`), `@lib/contracts`
(event shapes + topology constants), `@nestjs/config` (env); NEW:
`@nestjs/schedule` (outbox poll loop — justified in research.md R-5).

**Storage**: PostgreSQL 17 — two new models (`ProcessedEvent`, `OutboxEvent`
+ `OutboxStatus`), one migration; RabbitMQ 4 — one new retry queue
(`payment.requested.retry`, TTL + DLX args), one results queue for result
events; existing `payments_queue` / DLX / DLQ reused unchanged.

**Testing**: Jest unit (public service methods, Prisma/publisher/RMQ mocked);
integration (`DATABASE_URL_TEST` → `order_platform_test:2021`); E2E Supertest
(real `AppModule` + `ValidationPipe`, publisher stubbed); distributed E2E
(real broker `:5673`, real publisher, broker-down/redelivery drills).

**Target Platform**: Linux server via existing compose (`docker-compose.yml`
dev, `docker-compose.test.yml` project `order-platform-test`); full Docker
images are a later PRD phase and out of scope.

**Project Type**: API + async microservice worker sharing `libs/contracts`.

**Performance Goals**: Retry delay fixed 5s per attempt (env-overridable,
no worker-blocking sleep); outbox poll interval default 5s env-overridable;
every message terminal (acked or DLQ) within 3 attempts + delays; duplicate
delivery adds zero business writes.

**Constraints**: At-least-once delivery everywhere; consumer MUST be
idempotent; payment + order + outbox MUST commit in one transaction via
`txPrisma`; `requeue=true` loops forbidden; topology names/payloads MUST come
from `@lib/contracts`; destructive tests MUST use isolated test DB/broker.

**Scale/Scope**: 1 retry queue + 1 results queue added; 2 tables + 1 enum;
~6 contract additions (constants, 2 result payloads, 2 error classes);
consumer rework (1 file), publisher rework (initiation path + worker emit
client), 1 new poller; failure-matrix tests (12 scenarios per FR-012).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|-----------|--------|----------|
| I. Thin modules, explicit DI | ✅ PASS | New code lands in owning modules only: outbox in `payments`/`messaging`, retry/consume in `payment-worker`, shapes in `libs/contracts`. No new app or lib. |
| II. Transactional integrity | ✅ PASS | `process()` persists payment + order + `OutboxEvent` in one `$transaction` via `txPrisma`; worker claims `ProcessedEvent` inside the same tx as business writes (unique-violation ⇒ duplicate ⇒ ack). Terminal-state guard kept. |
| III. Event payment boundary | ✅ PASS | Initiation route unchanged (empty body, `request.user.sub` ownership); request payload extended only additively (`eventId`/`correlationId` already exist); all new names/patterns defined in `libs/contracts` constants. |
| IV. Test-first, right seam | ✅ PASS | Unit (mock Prisma/publisher/clock), integration (real PG), distributed E2E (real broker, drills for outage + redelivery + DLQ). Failure matrix FR-012 mapped in `quickstart.md`. |
| V. Boring tech, verified change | ✅ PASS (1 justified addition) | Retry via TTL+DLX on the existing broker (no plugin); single new dep `@nestjs/schedule` for the poll loop — alternatives rejected in R-5. Gate: `prettier` + `pnpm build` + narrowest real suite per change. |

Post-design re-check (2026-09-13): design adds no new modules/apps/deps
beyond the gated `@nestjs/schedule`; all writes stay behind `txPrisma`;
## Project Structure

### Documentation (this feature)

```text
specs/001-rabbitmq-reliability-outbox/
├── research.md          # Phase 0 output ($speckit-plan command)
├── data-model.md        # Phase 1 output ($speckit-plan command)
├── quickstart.md        # Phase 1 output ($speckit-plan command)
├── contracts/           # Phase 1 output ($speckit-plan command)
│   ├── events.md        # Envelope + request/result payloads + error taxonomy
│   └── topology.md      # Queues, exchanges, bindings, env vars
├── checklists/
│   └── requirements.md  # Spec quality gate (from $speckit-specify)
└── tasks.md             # Phase 2 output ($speckit-tasks command - NOT created by $speckit-plan)
```

### Source Code (repository root)

```text
prisma/
├── schema.prisma                # + ProcessedEvent, OutboxEvent, OutboxStatus
└── migrations/                  # + 1 migration for the above

libs/contracts/src/
├── payment-events.ts            # + retry/results constants, result payloads
├── processing-errors.ts         # NEW: RetryableError / NonRetryableError
└── index.ts                     # + re-exports

apps/simple-crud-nestjs/src/
├── app.module.ts                # + ScheduleModule.forRoot() (outbox poll loop)
├── messaging/
│   ├── messaging.payments.publisher.ts  # publish generic DomainEvent
│   └── outbox.publisher.ts              # NEW: poll PENDING → publish → mark
└── payments/payments.service.spec.ts    # + outbox-atomicity unit tests

apps/payment-worker/src/
├── payments-events.controller.ts # classify → retry(nack→retry path) / DLQ / idempotent process
├── payment-worker.service.ts     # ProcessedEvent claim in-tx + result events
├── rabbitmq/setup-rabbitmq-topology.ts  # + retry queue + results queue
└── payment-worker.module.ts      # + emit ClientProxy for result events
apps/simple-crud-nestjs/test/
├── *.integration-spec.ts        # + outbox/idempotency integration
├── app.e2e-spec.ts              # unchanged (publisher stubbed)
└── payment-flow.distributed-spec.ts  # + outage / redelivery / DLQ drills
```

**Structure Decision**: Monorepo layout kept; no new app or lib. The outbox
poller lives API-side (`simple-crud-nestjs`, owns the DB write path and the
existing `PaymentsPublisher`); the worker gains an emit client for result
events only. Debug line `throw new Error('testing DQL')` in the worker
consumer is removed as part of the consumer rework (touched file, blocks all
reliability behavior).

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| New dep `@nestjs/schedule` | Reliable interval poll loop for the outbox publisher with lifecycle tied to the Nest app | Hand-rolled `setInterval` bypasses DI/lifecycle/shutdown hooks; a separate poller process is a new deployment unit (later-phase concern) |
