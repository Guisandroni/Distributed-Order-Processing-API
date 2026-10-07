# Contracts: Topology

**Date**: 2026-09-13 | **Spec**: [spec.md](../spec.md) | **Code home**: `apps/payment-worker/src/rabbitmq/setup-rabbitmq-topology.ts` + Nest `queueOptions`, names in `libs/contracts/src/payment-events.ts` constants.

## Queues & bindings

```text
payments_queue (durable, existing)
  x-dead-letter-exchange: payments.dlx (existing)
  x-dead-letter-routing-key: payment.requested.dead (existing)
  [unchanged — still the DLQ path for exhausted/permanent failures]

payment.requested.retry (durable, NEW)
  x-message-ttl: RETRY_TTL_MS (default 5000)
  x-dead-letter-exchange: "" (default exchange)
  x-dead-letter-routing-key: payments_queue
  [expired messages fall back into the main queue → redelivery with x-death+1]

payment.requested.dlq (durable, existing, via payments.dlx)
  [unchanged — poison/permanent messages park here with attempt history in headers]

payments.results (durable, NEW)
  [worker-emitted payment.approved / payment.failed; no consumer this phase —
   distributed E2E binds an assertion consumer per test]
```

## Retry / DLQ flow

```text
consume payments_queue
  ├── ok → ack (+ emit result event)
  ├── NonRetryableError → nack(requeue=false) → DLQ
  └── RetryableError
        ├── x-death(payments_queue) < MAX_RETRIES → publish to retry queue → ack original
        └── exhausted → nack(requeue=false) → DLQ
retry queue ──TTL──▶ payments_queue (attempts+1 via x-death)
```

`basicNack(requeue=true)` / `nack(message, false, true)` is forbidden
anywhere in the codebase (infinite-loop vector from the PRD).

## Environment

| Var | Default | Meaning |
|-----|---------|---------|
| `MAX_RETRIES` | `3` | Attempts before DLQ (PRD-fixed; env makes it tunable without code change) |
| `RETRY_TTL_MS` | `5000` | Delay per retry; fixed-5s first version (progressive 5s/15s/60s is future work) |
| `OUTBOX_POLL_MS` | `5000` | Outbox publisher poll interval |
| `OUTBOX_BATCH_SIZE` | `20` | Max events claimed per poll |
| `RABBITMQ_URL` | — | Existing; test broker `:5673` for distributed suites |

## Test-broker note

`docker-compose.test.yml` gains no new services (same RabbitMQ image);
topology setup runs against `RABBITMQ_URL`, so dev (`:5672`) and test
(`:5673`) brokers each get the retry + results queues idempotently via
`assertQueue`/`assertExchange` (declare-only, never delete).
