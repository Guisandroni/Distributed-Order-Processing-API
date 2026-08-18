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
    .setTitle('NestJs Domain Drive')
    .setDescription('The api envolve orders by products with payment and users')
    .setVersion('1.0')
    .build();

  const documentFactory = () =>
    SwaggerModule.createDocument(app, configSwagger);
  SwaggerModule.setup('docs', app, documentFactory);

  await app.listen(process.env.PORT ?? 3333);
}
bootstrap();
