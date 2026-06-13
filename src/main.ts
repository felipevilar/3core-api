import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Valida e sanitiza todos os bodies; `whitelist` remove campos não declarados nos DTOs.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // CORS restrito à(s) origem(ns) do dashboard. CORS_ORIGIN aceita lista separada
  // por vírgula; default permite o dev local do Nuxt.
  const corsOrigin = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : ['http://localhost:3000', 'http://localhost:3030'];
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  const port = process.env.PORT ?? 3030;
  Logger.log('Starting server on port ' + port, 'Main');
  await app.listen(port);
}
void bootstrap();
