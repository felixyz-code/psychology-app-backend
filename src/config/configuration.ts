import 'dotenv/config';
import { Injectable } from '@nestjs/common';
import { RuntimeConfig } from './config.types';
import { validateRuntimeEnv } from './env.validation';

@Injectable()
export class AppConfigService {
  private readonly runtimeConfig: RuntimeConfig;

  constructor() {
    this.runtimeConfig = validateRuntimeEnv(process.env);
  }

  get databaseUrl() {
    return this.runtimeConfig.databaseUrl;
  }

  get jwtSecret() {
    return this.runtimeConfig.jwtSecret;
  }

  get jwtExpiresIn() {
    return this.runtimeConfig.jwtExpiresIn;
  }

  get port() {
    return this.runtimeConfig.port;
  }

  get nodeEnv() {
    return this.runtimeConfig.nodeEnv;
  }

  get uploadsPath() {
    return this.runtimeConfig.uploadsPath;
  }

  get corsOrigins() {
    return [...this.runtimeConfig.corsOrigins];
  }

  get swaggerEnabled() {
    return this.runtimeConfig.swaggerEnabled;
  }
}
