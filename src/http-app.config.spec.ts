import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { configureHttpApp, configureSwagger } from './http-app.config';

@Controller('http-security-harness')
class HttpSecurityHarnessController {
  @Get()
  getHealth() {
    return { status: 'ok' };
  }
}

describe('HTTP application configuration', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HttpSecurityHarnessController],
    }).compile();

    app = moduleRef.createNestApplication();
    configureHttpApp(app, {
      corsOrigins: ['http://localhost:4200'],
      trustProxyHops: 0,
    });
    configureSwagger(app, true);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('removes Express fingerprinting and applies the required security headers', async () => {
    const response = await request(app.getHttpServer())
      .get('/http-security-harness')
      .expect(200);

    expect(response.headers).not.toHaveProperty('x-powered-by');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers).not.toHaveProperty('strict-transport-security');
  });

  it('preserves the existing restrictive CORS policy', async () => {
    const allowedResponse = await request(app.getHttpServer())
      .get('/http-security-harness')
      .set('Origin', 'http://localhost:4200')
      .expect(200);
    const deniedResponse = await request(app.getHttpServer())
      .get('/http-security-harness')
      .set('Origin', 'https://untrusted.example')
      .expect(200);

    expect(allowedResponse.headers['access-control-allow-origin']).toBe(
      'http://localhost:4200',
    );
    expect(deniedResponse.headers).not.toHaveProperty(
      'access-control-allow-origin',
    );
  });

  it('does not trust forwarded headers unless configured explicitly', () => {
    const expressApp = app.getHttpAdapter().getInstance() as {
      get: (setting: string) => unknown;
    };

    expect(expressApp.get('trust proxy')).toBe(false);
  });

  it('continues to serve Swagger UI with the configured CSP', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs')
      .expect(200);

    expect(response.text).toContain('Swagger UI');
    const contentSecurityPolicy = response.headers['content-security-policy'];

    expect(contentSecurityPolicy).toContain("default-src 'self'");
    expect(contentSecurityPolicy).toContain("object-src 'none'");
    expect(contentSecurityPolicy).toContain(
      "script-src 'self' 'unsafe-inline'",
    );
    expect(contentSecurityPolicy).not.toContain('upgrade-insecure-requests');
  });
});
