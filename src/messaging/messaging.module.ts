import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { constants } from './messaging.constants';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PaymentsPublisher } from './messaging.payments.publisher';

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
            },

            persistent: true,
          },
        }),
      },
    ]),
  ],

  providers: [PaymentsPublisher],
  exports: [PaymentsPublisher],
})
export class MessagingModule {}
