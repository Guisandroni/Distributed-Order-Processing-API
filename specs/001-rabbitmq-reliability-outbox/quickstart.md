# Quickstart: RabbitMQ Reliability + Transactional Outbox

**Date**: 2026-09-13 | **Spec**: [spec.md](spec.md) | **Contracts**: [events](contracts/events.md), [topology](contracts/topology.md) | **Data model**: [data-model.md](data-model.md)

Validation guide only — no implementation code. Each scenario maps to spec
acceptance and the FR-012 failure matrix. Destructive scenarios use the
isolated stack exclusively (`order-platform-test`, `order_platform_test:2021`,
broker `:5673`).

## Prerequisites

```bash
pnpm install
docker compose -f docker-compose.test.yml up -d   # postgres :2021, rabbitmq :5673
DATABASE_URL=postgresql://test:test@127.0.0.1:2021/order_platform_test \
  pnpm exec prisma migrate deploy
```

## 1. Unit + integration (fast feedback)

```bash
pnpm test -- payments payment-worker outbox        # red-first per behavior
DATABASE_URL_TEST=postgresql://test:test@127.0.0.1:2021/order_platform_test \
  pnpm test:integration
```

Expect: error-classification matrix green (temporary ⇒ retryable, permanent ⇒
non-retryable); outbox-atomicity probe green (payment + order + `OutboxEvent`
commit together; publish failure keeps row `PENDING`); duplicate-`eventId`
claim test green (second insert violates unique ⇒ treated as duplicate).

## 2. Transient fault self-heals (Story 1 → SC-001, SC-002)

```bash
DATABASE_URL_TEST=... RABBITMQ_URL=amqp://test:test@127.0.0.1:5673 \
  pnpm test:e2e:distributed
```

Drill: fail the first delivery once (kill DB mid-processing or stub one
`RetryableError`), then observe — message visible in
`payment.requested.retry`, returns after ~5s, payment reaches terminal state,
retry queue drains, no DLQ entry. Then force 3 consecutive failures and
observe DLQ placement with `x-death` history and zero requeue loops.

## 3. Duplicate delivery charges once (Story 2 → SC-003)

Republish a processed `payment.requested` with the same `eventId`
(redelivery drill in the distributed suite). Expect: balances, order status,
and stock move exactly once; second delivery acked as duplicate;
`ProcessedEvent` holds one row for the `eventId`.

## 4. Broker outage loses nothing (Story 3 → SC-004)

Stop `rabbitmq-test`, `POST /orders/:id/payment` (expect success — payment
`PROCESSING` + `OutboxEvent PENDING` in DB), restart the broker. Expect: the
poller publishes every pending event, rows flip to `SENT` with
`processedAt`, worker processes them, exactly one downstream delivery each
even with two poller instances (claim via `SKIP LOCKED`).

## 5. Outcomes are traceable (Story 4 → SC-005, SC-006)

Process one approval + one permanent failure. Expect: one
`payment.approved` and one `payment.failed` on `payments.results`, each with
fresh `eventId` and the originating `correlationId`; logs show
classify → attempt-n → terminal/DLQ per `eventId` so support can replay any
order's story from persisted rows alone.

## 6. Gates before merge

```bash
pnpm exec prettier --check "apps/**/*.ts" "libs/**/*.ts"
pnpm build
pnpm test:e2e   # publisher-stubbed HTTP suite stays green (no regressions)
```

Full matrix (`test` + `test:integration` + `test:e2e` + `test:e2e:distributed`)
runs once at the end, never per slice (Constitution IV/V).
