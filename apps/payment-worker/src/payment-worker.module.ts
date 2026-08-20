import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentWorkerController } from './payment-worker.controller';
import { PaymentWorkerService } from './payment-worker.service';
import { PrismaModule } from '@lib/prisma';
import { PaymentEventsController } from './payments-events.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
  controllers: [PaymentWorkerController, PaymentEventsController],
  providers: [PaymentWorkerService],
})
export class PaymentWorkerModule {}
