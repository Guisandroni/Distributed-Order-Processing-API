import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { MessagingModule } from '../messaging/messaging.module';
import { PaymentEventsController } from './payments-events.controller';

@Module({
  imports: [MessagingModule],
  controllers: [PaymentsController, PaymentEventsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
