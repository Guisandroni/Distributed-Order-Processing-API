import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { PaymentWorkerController } from './payment-worker.controller';
import { PaymentWorkerService } from './payment-worker.service';
import { PrismaModule } from '@lib/prisma';
import { PaymentEventsController } from './payments-events.controller';
import { constants } from '../../../libs/contracts/src/payment-events';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    // Canal exclusivo de resultados: o transporte do microservice
    // continua na payments_queue; approved/failed saem por este emit.
    ClientsModule.registerAsync([
      {
        name: constants.paymentsResultsClient,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [configService.getOrThrow<string>('RABBITMQ_URL')],
            queue: constants.paymentsResultsQueue,
            queueOptions: {
              durable: true,
            },
            persistent: true,
          },
        }),
      },
    ]),
  ],
  controllers: [PaymentWorkerController, PaymentEventsController],
  providers: [PaymentWorkerService],
})
export class PaymentWorkerModule {}
