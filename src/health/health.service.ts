import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  DiskHealthIndicator,
  HealthCheckResult,
  HealthCheckService,
  HealthIndicatorResult,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { isAbsolute, resolve } from 'node:path';
import { AppConfigService } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';

const readinessTimeoutMs = 1000;

@Injectable()
export class HealthService {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly disk: DiskHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  live() {
    return { status: 'UP' };
  }

  async ready(): Promise<HealthCheckResult | { status: string }> {
    try {
      return await this.health.check([
        () => this.checkDatabase(),
        () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),
        () => this.memory.checkRSS('memory_rss', 500 * 1024 * 1024),
        () =>
          this.disk.checkStorage('storage_uploads', {
            path: this.getUploadsPath(),
            thresholdPercent: 0.9,
          }),
      ]);
    } catch {
      throw new ServiceUnavailableException('Service is not ready');
    }
  }

  private async checkDatabase(): Promise<HealthIndicatorResult> {
    await withTimeout(this.prisma.$queryRawUnsafe('SELECT 1'));
    return { database: { status: 'up' } };
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
      () => reject(new Error('Database health check timed out')),
      readinessTimeoutMs,
    );
  });

  return Promise.race([operation, timeoutPromise]).finally(() => {
    clearTimeout(timeout);
  });
}
