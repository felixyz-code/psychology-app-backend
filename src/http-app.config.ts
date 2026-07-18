import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Express } from 'express';
import helmet from 'helmet';
import { AppConfigService } from './config/configuration';

type HttpAppConfig = Pick<AppConfigService, 'corsOrigins' | 'trustProxyHops'>;

export function configureHttpApp(app: INestApplication, config: HttpAppConfig) {
  const expressApp = app.getHttpAdapter().getInstance() as Express;

  expressApp.disable('x-powered-by');
  if (config.trustProxyHops > 0) {
    expressApp.set('trust proxy', config.trustProxyHops);
  }
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          fontSrc: ["'self'", 'data:'],
          formAction: ["'self'"],
          frameAncestors: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          upgradeInsecureRequests: null,
        },
      },
      strictTransportSecurity: false,
    }),
  );

  app.enableCors({
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Organization-Id'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
}

export function configureSwagger(app: INestApplication, enabled: boolean) {
  if (!enabled) {
    return;
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Psychology App API')
    .setDescription('REST API documentation for the Psychology App backend')
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Paste the JWT access token here',
      },
      'bearer',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);
}
