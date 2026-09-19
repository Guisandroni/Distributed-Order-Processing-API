import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  constants,
  PaymentRequestedEvent,
} from '../../../../libs/contracts/src/payment-events';
import { DomainEvent } from '../../../../libs/contracts/src/domain-event';
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
    await this.client.connect();
  }

  async onApplicationShutdown() {
    await this.client.close();
  }

  publishPaymentRequested(event: PaymentRequestedEvent) {
    this.publish(event);
  }

  // Entrada genérica do outbox: qualquer envelope DomainEvent válido.
  // Mapeia eventType → pattern RMQ (hoje só payment.requested existe;
  // tipos futuros caem no próprio eventType como pattern).
  publish(event: DomainEvent<unknown>) {
    const pattern =
      event.eventType === constants.paymentRequested
        ? constants.paymentRequestedEvent
        : event.eventType;
    this.client.emit(pattern, event);
  }
}
