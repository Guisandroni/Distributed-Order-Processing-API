import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import type { PaymentRequestedEvent } from '../messaging/types/PaymentsRequestEvent.types';
import { constants } from '../messaging/messaging.constants';
import { Controller } from '@nestjs/common';

@Controller()
export class PaymentEventsController {
  @EventPattern(constants.paymentRequestedEvent)
  handlePaymentRequested(
    @Payload() event: PaymentRequestedEvent,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const message = context.getMessage();

    try {
      console.log(`PAYMENT REQUESTED RECEIVED: ${event}`);
    } catch (error) {
      console.error(`Error processing payment: ${error}`);
    }

    // channel.ack(message);
    // ack quando nao der "erro"
    //

    channel.nack(message, false, true);
  }
}
