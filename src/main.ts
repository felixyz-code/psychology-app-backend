import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AppConfigService } from './config/configuration';
import { configureHttpApp, configureSwagger } from './http-app.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  app.useLogger(app.get(Logger));
  const config = app.get(AppConfigService);

  configureHttpApp(app, config);
  configureSwagger(app, config.swaggerEnabled);
  app.enableShutdownHooks(['SIGTERM', 'SIGINT']);

  await app.listen(config.port);
}
void bootstrap();
