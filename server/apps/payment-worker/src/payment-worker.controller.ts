import { Controller } from '@nestjs/common';
import { PaymentWorkerService } from './payment-worker.service';

@Controller()
export class PaymentWorkerController {
  constructor(private readonly paymentWorkerService: PaymentWorkerService) {}
}
