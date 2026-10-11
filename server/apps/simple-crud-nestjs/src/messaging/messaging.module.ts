import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PaymentsPublisher } from './messaging.payments.publisher';
import { OutboxPublisher } from './outbox.publisher';
import { constants } from '../../../../libs/contracts/src/payment-events';

@Module({
  //config do rabbitmq
  //
  //
  imports: [
    ClientsModule.registerAsync([
      {
        name: constants.paymentsClient,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          //config do nest pro rabbitmq
          // nest -> rabb transporter -> amqp(dependencia)
          transport: Transport.RMQ,

          options: {
            urls: [configService.getOrThrow<string>('RABBITMQ_URL')],
            queue: constants.paymentsQueue,
            queueOptions: {
              durable: true,
              arguments: {
                'x-dead-letter-exchange': constants.paymentsDeadLetterExchange,
                'x-dead-letter-routing-key':
                  constants.paymentsDeadLetterRoutingKey,
              },
            },

            persistent: true,
          },
        }),
      },
    ]),
  ],

  providers: [PaymentsPublisher, OutboxPublisher],
  exports: [PaymentsPublisher, OutboxPublisher],
})
export class MessagingModule {}
