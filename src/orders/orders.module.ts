import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService],
  imports: [PaymentsModule],
})
export class OrdersModule {}
