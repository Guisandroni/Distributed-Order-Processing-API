# Contracts: Events

**Date**: 2026-09-13 | **Spec**: [spec.md](../spec.md) | **Code home**: `libs/contracts/src/`

All types extend the existing envelope (unchanged):

```ts
type DomainEvent<TPayload> = {
  eventId: string;       // unique per emission (randomUUID at origin)
  eventType: string;     // one of the constants below
  occurredAt: string;    // ISO-8601
  correlationId: string; // x-correlation-id header or randomUUID; propagated end-to-end
  payload: TPayload;
};
```

## `payment.requested` (existing, unchanged shape)

- Pattern: `PAYMENT_REQUESTED_EVENT` / type `payment.requested`.
- Payload: `{ paymentId: number; orderId: number; userId: number; amount: string }`.
- Origin: `PaymentsService.process` — now persisted via outbox; the envelope
  bytes published are identical to today (additive infra change only).

## `payment.approved` (NEW, FR-009)

- Pattern: `PAYMENT_APPROVED_EVENT` / type `payment.approved`.
- Payload: `{ paymentId: number; orderId: number; userId: number; amount: string }`.
- Emitted by: worker after the approve transaction commits; fresh `eventId`,
  incoming `correlationId` propagated.

## `payment.failed` (NEW, FR-009)

- Pattern: `PAYMENT_FAILED_EVENT` / type `payment.failed`.
- Payload: `{ paymentId: number; orderId: number; userId: number; amount: string; reason: string }`.
- Emitted by: worker after the fail transaction commits; fresh `eventId`,
  incoming `correlationId` propagated. `reason` is the classified failure
  (never secrets, tokens, or connection strings).

## Error taxonomy (NEW, FR-005)

```ts
// libs/contracts/src/processing-errors.ts
class RetryableError extends Error {}     // timeouts, resets, broker/dep unavailable
class NonRetryableError extends Error {}  // not-found, invalid payload/event/transition
```

- Unknown/unexpected errors default to **retryable** (safe direction: DLQ
  only after `MAX_RETRIES`, never on first sight).
- Consumer routing: `NonRetryableError` ⇒ DLQ; `RetryableError` ⇒ retry
  queue while attempts remain, DLQ when exhausted. Every decision logged
  with `eventId`, attempt number, and classification.
