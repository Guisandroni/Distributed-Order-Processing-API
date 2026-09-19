import { DomainEvent } from './domain-event';

export const constants = {
  paymentsClient: 'PAYMENTS_CLIENT',
  paymentsQueue: 'payments_queue',
  paymentRequested: 'payment.requested',
  paymentRequestedEvent: 'PAYMENT_REQUESTED_EVENT',

  paymentRequestedRetryQueue: 'payment.requested.retry',

  paymentsResultsQueue: 'payments.results',
  paymentsResultsClient: 'PAYMENTS_RESULTS_CLIENT',
  paymentApproved: 'payment.approved',
  paymentFailed: 'payment.failed',
  paymentApprovedEvent: 'PAYMENT_APPROVED_EVENT',
  paymentFailedEvent: 'PAYMENT_FAILED_EVENT',

  paymentsDeadLetterExchange: 'payments.dlx',
  paymentsDeadLetterQueue: 'payment.requested.dlq',
  paymentsDeadLetterRoutingKey: 'payment.requested.dead',
};

// export type PaymentRequestedEvent = {
//   paymentId: number;
//   orderId: number;
//   userId: number;
//   amount: string;
// };

export type PaymentRequestedPayload = {
  paymentId: number;
  orderId: number;
  userId: number;
  amount: string;
};

export type PaymentRequestedEvent = DomainEvent<PaymentRequestedPayload>;

export type PaymentApprovedPayload = {
  paymentId: number;
  orderId: number;
  userId: number;
  amount: string;
};

export type PaymentFailedPayload = {
  paymentId: number;
  orderId: number;
  userId: number;
  amount: string;
  reason: string;
};

export type PaymentApprovedEvent = DomainEvent<PaymentApprovedPayload>;
export type PaymentFailedEvent = DomainEvent<PaymentFailedPayload>;
