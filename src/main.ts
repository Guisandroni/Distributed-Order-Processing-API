import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

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
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
