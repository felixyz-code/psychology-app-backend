import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { access, constants } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { AppConfigService } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';

const readinessTimeoutMs = 1000;

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  live() {
    return { status: 'UP' };
  }

  async ready() {
    try {
      await Promise.all([
        withTimeout(this.prisma.$queryRawUnsafe('SELECT 1')),
        withTimeout(
          access(this.getUploadsPath(), constants.R_OK | constants.W_OK),
        ),
      ]);
      return { status: 'UP' };
    } catch {
      throw new ServiceUnavailableException('Service is not ready');
    }
  }

  private getUploadsPath() {
    return isAbsolute(this.config.uploadsPath)
      ? this.config.uploadsPath
      : resolve(process.cwd(), this.config.uploadsPath);
  }
}

function withTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeout: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error('Health check timed out')),
      readinessTimeoutMs,
    );
  });

  return Promise.race([operation, timeoutPromise]).finally(() => {
    clearTimeout(timeout);
  });
}
