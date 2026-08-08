import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );
  app.setGlobalPrefix('api');
  await app.listen(env.PORT);
  // eslint-disable-next-line no-console
  console.log(`Runway API listening on :${env.PORT} | DB=${env.ENABLE_DATABASE} | BYPASS_AUTH=${env.BYPASS_AUTH}`);
}
bootstrap();
