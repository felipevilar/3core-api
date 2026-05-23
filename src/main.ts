import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: '*', // Change this in production to restrict to specific origins
  });

  Logger.log('Starting server on port ' + (process.env.PORT ?? 3000), 'Main');
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
