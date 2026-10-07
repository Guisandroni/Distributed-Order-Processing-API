# Feature Specification: RabbitMQ Reliability + Transactional Outbox

**Feature Branch**: `001-rabbitmq-reliability-outbox`

**Created**: 2026-09-13

**Status**: Draft

**Input**: User description: "docs/PRD/prd02.md" — scoped to Fase 12 / Issue #12
(sections 4–13: retry, retry limit, error classification, backoff, idempotency,
payment states, result events, Transactional Outbox, Outbox Publisher, tests).
Later PRD phases (Redis, Docker, CI/CD, Terraform/AWS, observability,
Kubernetes) are explicitly out of scope and will get their own specs.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Temporary failure is retried, then parked (Priority: P1)

A buyer pays for an order. The payment worker hits a transient problem
(database timeout, connection reset, broker hiccup). The message MUST NOT go
straight to the dead-letter queue and MUST NOT loop forever: it waits in a
retry queue, returns to the main queue, and is processed again. After 3 failed
attempts it is parked in the DLQ for human inspection.

**Why this priority**: This is the core reliability promise of the phase —
transient faults self-heal without losing or duplicating money movement.

**Independent Test**: Force a transient failure on first delivery (e.g. kill
the database mid-processing once), then observe the payment reach a terminal
state on redelivery and the retry queue drain to zero.

**Acceptance Scenarios**:

1. **Given** a payment in PROCESSING with a message on the main queue,
   **When** processing fails with a temporary error, **Then** the message
   appears in the retry queue and NOT in the DLQ.
2. **Given** a message in the retry queue, **When** its delay expires,
   **Then** it returns to the main queue and the worker attempts processing
   again.
3. **Given** a message that has failed 3 times, **When** the third attempt
   fails, **Then** the message is routed to the DLQ and never requeued
   automatically.
4. **Given** any failure, **When** the worker rejects the message, **Then**
   it never uses infinite immediate requeue (no error → requeue → error loop).

---

### User Story 2 - Duplicate delivery charges once (Priority: P1)

The broker redelivers an already-processed payment event (worker crashed after
committing but before acknowledging, or a retry/outbox overlap). The system
recognizes the event identity, skips the business operation, acknowledges the
message, and the payment/order balances stay exactly as after the first
processing.

**Why this priority**: Double-charging on redelivery is the worst money bug;
idempotency is what makes "at-least-once delivery" safe.

**Independent Test**: Deliver the same payment event twice (real redelivery or
manual republish with the same event identity) and verify balances, payment
status, and stock movements change only once.

**Acceptance Scenarios**:

1. **Given** an already-processed event identity, **When** the same event is
   delivered again, **Then** no business write is executed and the message is
   acknowledged.
2. **Given** a never-seen event identity, **When** it is delivered, **Then**
   it is processed normally and its identity is recorded persistently.
3. **Given** a crash between commit and ack, **When** the broker redelivers,
   **Then** the redelivery is treated as a duplicate, not a new payment.

---

### User Story 3 - Payment request survives a broker outage (Priority: P2)

A buyer pays while RabbitMQ is down. The API still accepts the request: the
payment (PROCESSING) and its outbound event are committed together in one
database transaction. When the broker recovers, a publisher picks up the
pending event and delivers it — nothing the database accepted is ever lost.

**Why this priority**: This closes the commit-then-publish hole (DB ✅ /
publish ❌) that silently drops paid orders today.

**Independent Test**: Stop the broker, create a payment via the API (expect
success), restart the broker, and observe the event published and the payment
processed without any manual replay.

**Acceptance Scenarios**:

1. **Given** the broker is unreachable, **When** a buyer initiates payment,
   **Then** the API still succeeds and both payment and outbound event exist
   in the database.
2. **Given** pending outbound events and a recovered broker, **When** the
   publisher runs, **Then** each event is published exactly once downstream
   and marked sent with a sent timestamp.
3. **Given** a publish attempt that fails, **When** the publisher handles it,
   **Then** the event stays pending with an incremented attempt count for a
   later pass.

---

### User Story 4 - Payment outcome is observable downstream (Priority: P3)

After processing, interested parties can learn the result without polling the
database: every processed payment emits a result event (`approved` or
`failed`) carrying its own identity and a correlation identity that links the
original HTTP request through order, payment, outbox, broker, and worker.

**Why this priority**: Closes the loop for buyers/support ("what happened to
my order?") and is the foundation for the later observability phase.

**Independent Test**: Process one payment to approval and one to failure, then
verify one result event each with unique identity and a correlation identity
matching the originating request chain.

**Acceptance Scenarios**:

1. **Given** a successfully processed payment, **When** processing commits,
   **Then** an approval result event with a unique event identity and the
   chain correlation identity is emitted.
2. **Given** a permanently failed payment, **When** processing commits,
   **Then** a failure result event with a unique event identity and the chain
   correlation identity is emitted.
3. **Given** any result event, **When** inspected, **Then** its payload
   contracts live in the shared contracts location, not duplicated per app.

### Edge Cases

- Worker crashes after DB commit but before ACK → redelivery MUST be a
  no-op duplicate (Story 2), not a second charge.
- Invalid payload or nonexistent payment → permanent failure: straight to
  DLQ with no retry, decision logged.
- Broker down for an extended period → API keeps accepting (outbox grows);
  publisher drains the backlog in order without double-publish when two
  publisher instances overlap.
- Poison message failing all 3 attempts → DLQ with attempt history preserved
  for inspection; DLQ depth is observable.
- Duplicate outbox publish vs worker redelivery arriving together → exactly
  one business effect; both messages acknowledged.
- Payment already in a terminal state (APPROVED/FAILED) receiving another
  event → rejected as invalid transition, no state change.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST route a temporarily-failed payment message to a
  dedicated retry queue instead of the DLQ or immediate requeue.
- **FR-002**: System MUST hold messages in the retry queue for a configured
  delay, then return them to the main queue for reprocessing.
- **FR-003**: System MUST stop immediate-requeue behavior (`requeue=true`
  loops are forbidden); every redelivery path MUST go through the
  retry queue or the DLQ.
- **FR-004**: System MUST cap attempts at `MAX_RETRIES = 3` (attempts tracked
  per message) and route the message to the DLQ after the third failure.
- **FR-005**: System MUST classify processing errors into temporary
  (retry → e.g. database timeout, connection reset, broker/dependency
  unavailable) and permanent (DLQ directly → e.g. payment not found, invalid
  payload/event, violated business rule), and log the classification decision.
- **FR-006**: System MUST apply a fixed 5s delay per retry in this phase,
  configurable via environment without code changes, with infrastructure-level
  delay (message TTL/dead-letter routing), never a blocked worker sleep.
- **FR-007**: System MUST persist every processed event identity
  (`eventId`, unique) with its type and processing timestamp before
  acknowledging, and skip the business operation on duplicate identity.
- **FR-008**: System MUST enforce the payment state machine
  (`PROCESSING → APPROVED`, `PROCESSING → FAILED`); transitions out of
  terminal states (`APPROVED → PROCESSING`, `FAILED → PROCESSING`) MUST be
  rejected and leave state unchanged.
- **FR-009**: System MUST emit a result event (`approved` / `failed`) per
  processed payment, each carrying a unique `eventId` and the chain
  `correlationId`; payloads and event types MUST be defined once in the
  shared contracts location.
- **FR-010**: System MUST persist the payment, the order update, and the
  outbound event atomically in a single database transaction (commit-then-
  publish without a transaction is forbidden).
- **FR-011**: System MUST provide a publisher that polls pending outbound
  events, publishes them, marks success sent with timestamp, increments the
  attempt count on failure, and is safe under concurrent publisher instances
  (no double-publish of the same event).
- **FR-012**: System MUST cover the failure matrix with tests: ack, retry,
  retry limit, DLQ routing, permanent vs temporary errors, redelivery,
  idempotency/duplication, outbox persistence, broker outage, and publisher
  reprocessing.

### Key Entities

- **Payment Message**: a delivery of a payment request on the queue; carries
  attempt count, delay state (main / retry / dead-letter), and classification
  of its last failure.
- **ProcessedEvent**: persistent record of an already-handled event identity
  (`eventId` unique, event type, processed timestamp); the basis for
  duplicate suppression.
- **Payment**: state machine `PROCESSING → APPROVED | FAILED`; terminal
  states are final and reject further transitions.
- **OutboxEvent**: durable outbound event (`eventType`, aggregate identity,
  payload, status pending/sent, attempt count, timestamps); committed in the
  same transaction as its payment and published asynchronously.
- **Result Event**: `approved` / `failed` outcome of a processed payment with
  unique `eventId` and chain `correlationId` for end-to-end tracing.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A payment interrupted once by a transient fault still reaches
  its correct terminal state without manual intervention.
- **SC-002**: Zero messages loop forever: every message ends acknowledged
  from the main flow or parked in the DLQ within 3 attempts plus delays.
- **SC-003**: The same payment event delivered twice changes money, order
  status, and stock exactly once (verified by balances after redelivery).
- **SC-004**: With the broker down, 100% of accepted payment requests are
  preserved in the database and all are published after recovery with no
  manual replay.
- **SC-005**: Every processed payment yields exactly one result event
  traceable back to its originating request via a shared correlation identity.
- **SC-006**: A support operator can answer "what happened to this order?"
  from persisted records alone: attempt history, classification decisions,
  terminal state, and DLQ placement are all recorded.

## Assumptions

- Scope is Fase 12 / Issue #12 only (PRD sections 4–13). Redis caching,
  full Docker, CI/CD, Terraform/AWS, CloudWatch/observability, and Kubernetes
  (PRD phases 13–18) are out of scope and will be specified separately.
- `MAX_RETRIES = 3` and fixed 5s backoff per the PRD; progressive backoff
  (5s/15s/60s) is a documented future step, not this feature.
- Existing topology (`payments_queue`, `payments.dlx`, `payment.requested.dlq`)
  is reused and extended with `payment.requested.retry`, not replaced.
- Existing guarantees stay intact: empty-body payment initiation, ownership
  from authenticated user, four-field request payload shape (extended only by
  additive `eventId`/`correlationId`), idempotent worker on terminal states.
- Tests run against the isolated test database and test broker; destructive
  scenarios never touch development infrastructure.
