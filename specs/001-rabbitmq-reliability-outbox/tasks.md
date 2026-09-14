# Tasks: RabbitMQ Reliability + Transactional Outbox

**Input**: Design documents from `specs/001-rabbitmq-reliability-outbox/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Included — FR-012 explicitly requires the failure-matrix tests, and Constitution IV mandates red-first (write test, confirm FAIL, then implement).

**Organization**: Tasks grouped by user story; each story is an independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Exact file paths in every description

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependency, environment, and isolated test-stack readiness

- [X] T001 Install `@nestjs/schedule` via pnpm in `package.json` (outbox poll loop, gated in plan.md)
- [X] T002 [P] Add `MAX_RETRIES`, `RETRY_TTL_MS`, `OUTBOX_POLL_MS`, `OUTBOX_BATCH_SIZE` to `.env.example`
- [ ] T003 [P] Bring up isolated test stack and migrate it via `docker-compose.test.yml` (`docker compose -f docker-compose.test.yml up -d`, then `prisma migrate deploy` with test `DATABASE_URL`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared schema, contracts, taxonomy, and topology every story builds on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Add `ProcessedEvent` model, `OutboxStatus` enum, and `OutboxEvent` model (with `@@index([eventType])`, `@@index([status])`, `@@index([createdAt])`, `"attempts" default 0`, `"status" default PENDING`) to `prisma/schema.prisma`, then create and apply the migration in `prisma/migrations/`; apply the same migration to the isolated test database (`docker-compose.test.yml` stack) before any story test that needs the new tables
- [ ] T005 [P] Add retry/results constants (`paymentRequestedRetryQueue`, `paymentsResultsQueue`, `paymentApprovedEvent`, `paymentFailedEvent`) and `PaymentApprovedPayload` / `PaymentFailedPayload` (payload `{ paymentId: number; orderId: number; userId: number; amount: string }`, failed adds `{ reason: string }`) to `libs/contracts/src/payment-events.ts`, re-export from `libs/contracts/src/index.ts`
- [ ] T006 [P] Create `RetryableError` / `NonRetryableError` classes (unknown errors default retryable) in `libs/contracts/src/processing-errors.ts`, re-export from `libs/contracts/src/index.ts`
- [ ] T007 Declare `payment.requested.retry` (with `x-message-ttl` from `RETRY_TTL_MS` default 5000, dead-letter back to `payments_queue`) and durable `payments.results` in `apps/payment-worker/src/rabbitmq/setup-rabbitmq-topology.ts` only; the existing main-queue declarations in `apps/payment-worker/src/main.ts` and `apps/simple-crud-nestjs/src/messaging/messaging.module.ts` already carry the DLX args — verify them unchanged, no main-queue behavior change in this task
- [ ] T008 Register `ScheduleModule.forRoot()` in `apps/simple-crud-nestjs/src/app.module.ts`

**Checkpoint**: Foundation ready — `pnpm build` green; user stories can now proceed in priority order (or in parallel if staffed, noting same-file sequences below)

---

## Phase 3: User Story 1 - Temporary failure retried, then parked (Priority: P1) 🎯 MVP

**Goal**: Retryable failures wait in the retry queue and return to the main queue; messages end acked or DLQ within 3 attempts; no `requeue=true` loops

**Independent Test**: Force one transient failure → payment still reaches terminal state with retry queue draining to zero; force 3 consecutive failures → DLQ placement with `x-death` history

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T009 [P] [US1] Unit test for x-death attempt routing (retry while attempts < MAX_RETRIES, DLQ when exhausted, NonRetryableError straight to DLQ) in `apps/payment-worker/src/payments-events.controller.spec.ts`
- [ ] T010 [P] [US1] Unit test for error classification (not-found/invalid payload/invalid transition raise NonRetryableError; timeouts/unknown raise RetryableError) in `apps/payment-worker/src/payment-worker.service.spec.ts`

### Implementation for User Story 1

- [ ] T011 [US1] Throw classified errors (`NonRetryableError` for not-found/invalid/terminal-violation, `RetryableError` otherwise) in `apps/payment-worker/src/payment-worker.service.ts`
- [ ] T012 [US1] Rework consumer in `apps/payment-worker/src/payments-events.controller.ts`: remove `throw new Error('testing DQL')`; derive the current attempt from RabbitMQ `x-death` history; read `MAX_RETRIES` (default 3) and `RETRY_TTL_MS` (default 5000) from environment; for a `RetryableError` with attempts remaining, republish the original `message.content` unchanged via `channel.sendToQueue(payment.requested.retry, ...)` preserving properties/headers and `ack` the original only after successful publication; for an exhausted retryable error or any `NonRetryableError`, use `channel.nack(message, false, false)` so the main-queue DLX routes it to the DLQ; log every decision with eventId + attempt + classification (depends on T006, T007, T011)
- [ ] T013 [US1] Distributed drill for transient-failure recovery (assert successful-processing ACK and queue drain), and 3-failures-to-DLQ with `x-death` history (assert DLQ placement, inspectable via message headers and the management UI) in `apps/simple-crud-nestjs/test/payment-flow.distributed-spec.ts` (depends on T012)

**Checkpoint**: User Story 1 fully functional and independently testable (SC-001, SC-002)

---

## Phase 4: User Story 2 - Duplicate delivery charges once (Priority: P1)

**Goal**: Redelivered events are recognized by `eventId` and acked without re-executing business writes; terminal states reject re-entry

**Independent Test**: Deliver the same payment event twice → balances, order status, and stock change exactly once; `ProcessedEvent` holds one row

### Tests for User Story 2 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T014 [P] [US2] Unit test for duplicate `eventId` claim (second delivery returns current payment untouched, zero business writes) in `apps/payment-worker/src/payment-worker.service.spec.ts`
- [ ] T015 [P] [US2] Integration test for redelivery + terminal-state rejection against real PostgreSQL in `apps/simple-crud-nestjs/test/payments.integration-spec.ts` (matches `.*\.integration-spec\.ts$`; MUST NOT import `@lib/contracts` — integration jest config has no such mapping)

### Implementation for User Story 2

- [ ] T016 [US2] Insert `ProcessedEvent` claim inside the approve/fail `$transaction` via `txPrisma` (unique-violation ⇒ duplicate ⇒ ack, no business writes) and raise `NonRetryableError` on terminal-state re-entry in `apps/payment-worker/src/payment-worker.service.ts` (depends on T004, T011)
- [ ] T017 [US2] Distributed redelivery drill (same `eventId` twice ⇒ single effect) in `apps/simple-crud-nestjs/test/payment-flow.distributed-spec.ts` (depends on T016)

**Checkpoint**: User Stories 1 AND 2 both work independently (SC-003)

---

## Phase 5: User Story 3 - Payment request survives broker outage (Priority: P2)

**Goal**: `process()` commits payment + order + outbox row atomically; poller publishes `PENDING` rows exactly once after recovery

**Independent Test**: Stop broker → pay (success) → restart broker → event published and processed with no manual replay, no double-publish with overlapping pollers

### Tests for User Story 3 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T018 [P] [US3] Unit test for single-transaction persistence (payment + order + `OutboxEvent PENDING` commit together; publish failure keeps row `PENDING`) in `apps/simple-crud-nestjs/src/payments/payments.service.spec.ts`
- [ ] T019 [P] [US3] Unit test for poller claiming (`SKIP LOCKED` batch, success ⇒ `SENT` + `processedAt`, failure ⇒ `attempts++` stays `PENDING`; corrupt envelope/unsupported type/invalid payload ⇒ `NonRetryableError`, logged, retained, never published) in `apps/simple-crud-nestjs/src/messaging/outbox.publisher.spec.ts`

### Implementation for User Story 3

- [ ] T020 [US3] Persist payment + order update + `OutboxEvent` (with full `DomainEvent` envelope JSON payload, `aggregateId` set to `String(order.id)`) in one `$transaction` via `txPrisma` in `apps/simple-crud-nestjs/src/payments/payments.service.ts` (depends on T004)
- [ ] T021 [US3] Generalize `PaymentsPublisher` to publish any `DomainEvent` envelope in `apps/simple-crud-nestjs/src/messaging/messaging.payments.publisher.ts` (depends on T020)
- [ ] T022 [US3] Create `OutboxPublisher` poller (`@Interval(OUTBOX_POLL_MS)`, batch `OUTBOX_BATCH_SIZE`, concurrent-safe claim, mark `SENT` + `processedAt` on success, `attempts++` while `PENDING` on publish failure; validate the envelope before publish — corrupt rows are logged as `NonRetryableError`, never published, never retried indefinitely, retained for operator inspection per `data-model.md`) in `apps/simple-crud-nestjs/src/messaging/outbox.publisher.ts` and register it in `apps/simple-crud-nestjs/src/messaging/messaging.module.ts` (depends on T008, T021)
- [ ] T023 [US3] Broker-outage drill (pay while broker down ⇒ `PENDING` row; recover ⇒ published once, processed) in `apps/simple-crud-nestjs/test/payment-flow.distributed-spec.ts`; run a second `OutboxPublisher` against the same backlog during recovery and assert no row is concurrently claimed by both publishers (depends on T022)

**Checkpoint**: User Stories 1–3 all work independently (SC-004)

---

## Phase 6: User Story 4 - Payment outcome observable downstream (Priority: P3)

**Goal**: Every processed payment emits one result event with fresh `eventId` and propagated `correlationId` to the durable results queue

**Independent Test**: Process one approval + one failure → one `payment.approved` + one `payment.failed` on `payments.results`, correlation identities matching origins

### Tests for User Story 4 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T024 [P] [US4] Unit test for result-event emission (approve ⇒ approved event, fail ⇒ failed event with `reason`, fresh `eventId`, propagated `correlationId`) in `apps/payment-worker/src/payment-worker.service.spec.ts`

### Implementation for User Story 4

- [ ] T025 [US4] Register a dedicated RMQ emit `ClientProxy` bound to the `paymentsResultsQueue` queue (durable, declared in T007) in `apps/payment-worker/src/payment-worker.module.ts` for result-event publication; the worker microservice transport stays bound to `paymentsQueue` — result events travel exclusively through this emit client (depends on T005, T007)
- [ ] T026 [US4] Emit `payment.approved` / `payment.failed` via the T025 emit client after commit (never on duplicate-ack path) in `apps/payment-worker/src/payment-worker.service.ts` (depends on T016, T025)
- [ ] T027 [US4] Results-queue assertion (exactly-once result per payment, correlation match) in `apps/simple-crud-nestjs/test/payment-flow.distributed-spec.ts` (depends on T026)

**Checkpoint**: All user stories independently functional (SC-005, SC-006)

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup and full-matrix verification

- [ ] T028 [P] Remove dead commented code in touched files (`apps/simple-crud-nestjs/src/payments/payments.service.ts` commented approve/fail blocks, `apps/payment-worker/src/payments-events.controller.ts` commented ack lines, `apps/simple-crud-nestjs/src/messaging/messaging.payments.publisher.ts` commented subscriptions)
- [ ] T029 Run gates: `prettier --check`, `pnpm build`, then the full matrix `pnpm test` + `pnpm test:integration` + `pnpm test:e2e` + `pnpm test:e2e:distributed` (once at the end, per Constitution V); confirm the T004 migration is applied to the test database before the integration/distributed suites run
- [ ] T030 Validate `specs/001-rabbitmq-reliability-outbox/quickstart.md` scenarios 1–6 end-to-end (depends on T029)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Stories (Phases 3–6)**: Depend on Foundational; run in priority order P1 → P1 → P2 → P3, or in parallel if staffed (respect same-file chains: T011→T012, T011→T016→T026)
- **Polish (Phase 7)**: Depends on all stories being complete

### User Story Dependencies

- **US1 (P1)**: After Foundational — no other-story dependencies (MVP)
- **US2 (P1)**: After Foundational — touches `payment-worker.service.ts` after T011, independently testable
- **US3 (P2)**: After Foundational — API-side only, no worker changes, independently testable
- **US4 (P3)**: After Foundational — builds on T016 claim semantics (no double-emit on duplicates), independently testable

### Within Each User Story

- Tests MUST be written and FAIL before implementation (Constitution IV)
- Models/migration (foundation) → services → consumer/poller → drills
- Story checkpoint validated before moving to next priority

### Parallel Opportunities

- T002 + T003 (different surfaces); T005 + T006 (different files); T009 + T010, T014 + T015, T018 + T019, T024 standalone (different spec files)
- US1 vs US3 implementation (T011/T012 vs T020–T022: worker vs API files, no overlap)
- T028 cleanup + T029 gates preparation can overlap story tail work; T029 runs once at the end

---

## Parallel Example: User Story 1

```bash
# Red-first tests together (different spec files):
Task: "Unit test for x-death attempt routing in apps/payment-worker/src/payments-events.controller.spec.ts"
Task: "Unit test for error classification in apps/payment-worker/src/payment-worker.service.spec.ts"

# After T011 lands, consumer rework is unblocked:
Task: "Rework consumer routing in apps/payment-worker/src/payments-events.controller.ts"
```

## Parallel Example: User Stories 1 + 3 (different developers)

```bash
# Developer A (worker side):
Task: "T011 classified errors + T012 consumer rework (US1)"
# Developer B (API side, needs only foundation):
Task: "T020 single-tx outbox write + T021 publisher generalize + T022 poller (US3)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T003)
2. Complete Phase 2: Foundational (T004–T008)
3. Complete Phase 3: US1 (T009–T013)
4. **STOP and VALIDATE**: transient-failure drill + DLQ drill green; deploy/demo retry behavior

### Incremental Delivery

1. Setup + Foundational → retry/DLQ/outbox infra declared, contracts shared
2. + US1 → self-healing retries (MVP!)
3. + US2 → redelivery-safe money movement
4. + US3 → outage-proof intake
5. + US4 → traceable outcomes
6. Each increment keeps prior stories green (distributed spec is cumulative)

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. Developer A: US1 → US2 → US4 (worker thread, same-file chain)
3. Developer B: US3 (API thread, no file overlap with A)
4. Join at Phase 7 polish + full matrix

---

## Notes

- [P] tasks = different files, no dependencies — safe for parallel agents
- [USn] label maps every story task to spec.md acceptance for traceability
- Data-model constraints quoted verbatim in T004 (`default 0`, `default PENDING`, index lists)
- `payments.integration-spec.ts` is a NEW file (matches existing `testRegex`); it MUST NOT import `@lib/contracts` (integration jest config lacks the mapping — use inline literals or import from relative `../../libs/contracts/src`)
- Result-event routing is fixed for this feature: worker emits via a dedicated RMQ emit `ClientProxy` bound to the durable `paymentsResultsQueue` (T025); the worker microservice transport stays on `paymentsQueue`. No exchange, no second deployable.
- Retry re-entry is fixed for this feature: retryable failures are republished with `channel.sendToQueue(paymentRequestedRetryQueue, message.content, ...)` preserving properties/headers, and the original delivery is ACKed only after successful publication; TTL expiration dead-letters the retry message back to `payments_queue` (T012).
- Retry attempt semantics are fixed: `x-death` history drives the count; `MAX_RETRIES` (default 3) and `RETRY_TTL_MS` (default 5000) come from environment (T002/T012).
- Corrupt Outbox rows are not retried indefinitely: they are classified non-retryable, logged, never published, and retained for operator inspection per `data-model.md` (T019/T022).
- `aggregateId` convention is fixed: `OutboxEvent.aggregateId = String(order.id)` for payment-related outbound events (T020).
- Commit after each task or logical group; stop at any checkpoint to validate
