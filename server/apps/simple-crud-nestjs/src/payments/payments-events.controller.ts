// import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
// import type { PaymentRequestedEvent } from '../../simple-crud-nestjs/src/messaging/types/PaymentsRequestEvent.typesPaymentsRequestEvent.types';
// import { constants } from '../../simple-crud-nestjs/src/messaging/messaging.constantssaging/messaging.constants';
// import { Controller } from '@nestjs/common';
// import { PaymentsService } from '../../simple-crud-nestjs/src/payments/payments.servicenestjs/src/payments/payments.service';
// import { Channel, ConsumeMessage } from 'amqplib';

// @Controller()
// export class PaymentEventsController {
//   constructor(private readonly paymentsService: PaymentsService) {}
//   @EventPattern(constants.paymentRequestedEvent)
//   async handlePaymentRequested(
//     @Payload() event: PaymentRequestedEvent,
//     @Ctx() context: RmqContext,
//   ) {
//     const channel = context.getChannelRef() as Channel;
//     const message = context.getMessage() as ConsumeMessage;

//     try {
//       console.log(`PAYMENT REQUESTED RECEIVED: ${event.paymentId}`);

//       const payment = await this.paymentsService.processRequestedPayment(
//         event.paymentId,
//       );

//       console.log(`Payment ${payment.id}: ${payment.status}`);
//       channel.ack(message);
//     } catch (error) {
//       console.error(`Error processing payment: ${event.paymentId}`, error);

//       // channel.ack(message);
//       // ack quando nao der "erro"
//       //

//       channel.nack(message, false, true);
//     }
//   }
// }
