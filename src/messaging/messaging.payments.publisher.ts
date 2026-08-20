import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { constants } from './messaging.constants';
import { ClientProxy } from '@nestjs/microservices';
import { PaymentRequestedEvent } from './types/PaymentsRequestEvent.types';
@Injectable()
export class PaymentsPublisher
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  constructor(
    @Inject(constants.paymentsClient)
    //conexao lazy
    private readonly client: ClientProxy,
  ) {}

  async onApplicationBootstrap() {
    // this.client.status.subscribe((status) => {
    //   console.log(`[RMQ CONSUMER STATUS]: ${status}`);
    // });

    // this.client.on( (error) => {
    //   console.error(error);
    // });

    await this.client.connect();
  }

  async onApplicationShutdown() {
    await this.client.close();
  }

  publishPaymentRequested(event: PaymentRequestedEvent) {
    this.client.emit(constants.paymentRequestedEvent, event);
  }
}
