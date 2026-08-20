export const constants = {
  paymentsClient: 'PAYMENTS_CLIENT',
  paymentsQueue: 'payments_queue',
  paymentRequested: 'payment.requested',
  paymentRequestedEvent: 'PAYMENT_REQUESTED_EVENT',
};

export type PaymentRequestedEvent = {
  paymentId: number;
  orderId: number;
  userId: number;
  amount: string;
};
