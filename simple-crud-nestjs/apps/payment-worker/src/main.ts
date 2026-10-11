import { NestFactory } from '@nestjs/core';
import { PaymentWorkerModule } from './payment-worker.module';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { constants } from '@lib/contracts';
import { setupRabbitMqTopology } from './rabbitmq/setup-rabbitmq-topology';

async function bootstrap() {
  await setupRabbitMqTopology();

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    PaymentWorkerModule,

    {
      transport: Transport.RMQ,

      options: {
        urls: [process.env.RABBITMQ_URL!],

        queue: constants.paymentsQueue,

        queueOptions: {
          durable: true,

          arguments: {
            'x-dead-letter-exchange': constants.paymentsDeadLetterExchange,

            'x-dead-letter-routing-key': constants.paymentsDeadLetterRoutingKey,
          },
        },
        noAck: false,
      },
    },
  );
  app.status.subscribe((status) => {
    console.log(`[RMQ CONSUMER STATUS]: ${status}`);
  });

  app.on('error', (error) => {
    console.error(`[RMQ CONSUMER ERROR]`, error);
  });
  // await app.startAllMicroservices();
  await app.listen();
}
bootstrap();
