import { DomainEvent } from './domain-event';

export const constants = {
  paymentsClient: 'PAYMENTS_CLIENT',
  paymentsQueue: 'payments_queue',
  paymentRequested: 'payment.requested',
  paymentRequestedEvent: 'PAYMENT_REQUESTED_EVENT',

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
