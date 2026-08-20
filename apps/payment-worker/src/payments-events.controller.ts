import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { Controller } from '@nestjs/common';
import { Channel, ConsumeMessage } from 'amqplib';
import { PaymentWorkerService } from './payment-worker.service';
import type { PaymentRequestedEvent } from '../../../libs/contracts/src/payment-events';
import { constants } from '../../../libs/contracts/src/payment-events';

@Controller()
export class PaymentEventsController {
  constructor(private readonly paymentWorkerService: PaymentWorkerService) {}
  @EventPattern(constants.paymentRequestedEvent)
  async handlePaymentRequested(
    @Payload() event: PaymentRequestedEvent,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef() as Channel;
    const message = context.getMessage() as ConsumeMessage;

    try {
      console.log(`PAYMENT REQUESTED RECEIVED: ${event.paymentId}`);

      const payment = await this.paymentWorkerService.processRequestedPayment(
        event.paymentId,
      );

      console.log(`Payment ${payment.id}: ${payment.status}`);
      channel.ack(message);
    } catch (error) {
      console.error(`Error processing payment: ${event.paymentId}`, error);

      // channel.ack(message);
      // ack quando nao der "erro"
      //

      channel.nack(message, false, true);
    }
  }
}
