import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { constants } from './messaging/messaging.constants';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  //validation about data users in schema
  //
  // only accept definition on create-user-dto
  app.useGlobalPipes(
    new ValidationPipe({
      //remove camps not exist on DTO
      whitelist: true,
      //return error
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const configSwagger = new DocumentBuilder()
    .setTitle('NestJs Domain Drive')
    .setDescription('The api envolve orders by products with payment and users')
    .setVersion('1.0')
    .build();

  const documentFactory = () =>
    SwaggerModule.createDocument(app, configSwagger);
  SwaggerModule.setup('docs', app, documentFactory);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,

    options: {
      urls: [process.env.RABBITMQ_URL!],

      queue: constants.paymentsQueue,

      queueOptions: {
        durable: true,
      },
      noAck: false,
    },
  });

  await app.listen(process.env.PORT ?? 3333);
}
bootstrap();
