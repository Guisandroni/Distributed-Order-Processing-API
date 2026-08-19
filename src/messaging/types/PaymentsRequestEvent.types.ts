export type PaymentRequestedEvent = {
  paymentId: number;
  orderId: number;
  userId: number;
  amount: string;
};
