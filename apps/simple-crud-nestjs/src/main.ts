import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

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
    .setTitle('Order Platform API')
    .setDescription(
      'API para gerenciamento de usuários, produtos, pedidos e pagamentos.',
    )
    .setVersion('1.0.0')
    .addTag('auth', 'Autenticação e criação de contas')
    .addTag('users', 'Gerenciamento de usuários')
    .addTag('products', 'Catálogo e estoque de produtos')
    .addTag('orders', 'Pedidos e processamento de pagamentos')
    .addTag('payments', 'Consulta e manutenção de pagamentos')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Informe o token JWT obtido em POST /auth/login.',
      },
      'access-token',
    )
    .build();

  const documentFactory = () =>
    SwaggerModule.createDocument(app, configSwagger);
  SwaggerModule.setup('docs', app, documentFactory, {
    customSiteTitle: 'Order Platform API Docs',
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // const rmqServer = app.connectMicroservice<MicroserviceOptions>({
  //   transport: Transport.RMQ,

  //   options: {
  //     urls: [process.env.RABBITMQ_URL!],

  //     queue: constants.paymentsQueue,

  //     queueOptions: {
  //       durable: true,
  //     },
  //     noAck: false,
  //   },
  // });

  // rmqServer.status.subscribe((status) => {
  //   console.log(`[RMQ CONSUMER STATUS]: ${status}`);
  // });

  // rmqServer.on('error', (error) => {
  //   console.error(`[RMQ CONSUMER ERROR]`, error);
  // });

  // await app.startAllMicroservices();

  await app.listen(process.env.PORT ?? 3333);
}
void bootstrap();
