import { ServiceUnavailableException } from '@nestjs/common';
import {
  HealthCheckService,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { AppConfigService } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let healthCheckService: jest.Mocked<HealthCheckService>;
  let memoryHealthIndicator: jest.Mocked<MemoryHealthIndicator>;
  let diskHealthIndicator: jest.Mocked<DiskHealthIndicator>;
  let prismaService: { $queryRawUnsafe: jest.Mock };
  let configService: AppConfigService;
  let service: HealthService;

  beforeEach(() => {
    healthCheckService = {
      check: jest
        .fn()
        .mockImplementation(
          async (indicators: (() => Promise<Record<string, unknown>>)[]) => {
            const results = await Promise.all(indicators.map((fn) => fn()));
            const info = Object.assign({}, ...results) as Record<
              string,
              unknown
            >;
            return {
              status: 'ok',
              info,
              error: {},
              details: info,
            };
          },
        ),
    } as unknown as jest.Mocked<HealthCheckService>;

    memoryHealthIndicator = {
      checkHeap: jest.fn().mockResolvedValue({ memory_heap: { status: 'up' } }),
      checkRSS: jest.fn().mockResolvedValue({ memory_rss: { status: 'up' } }),
    } as unknown as jest.Mocked<MemoryHealthIndicator>;

    diskHealthIndicator = {
      checkStorage: jest
        .fn()
        .mockResolvedValue({ storage_uploads: { status: 'up' } }),
    } as unknown as jest.Mocked<DiskHealthIndicator>;

    prismaService = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };

    configService = {
      uploadsPath: 'uploads',
    } as AppConfigService;

    service = new HealthService(
      healthCheckService,
      memoryHealthIndicator,
      diskHealthIndicator,
      prismaService as unknown as PrismaService,
      configService,
    );
  });

  it('reports liveness without dependencies', () => {
    expect(service.live()).toEqual({ status: 'UP' });
    expect(prismaService.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('reports readiness when indicators and database are healthy', async () => {
    const result = await service.ready();

    expect(result).toEqual({
      status: 'ok',
      info: {
        database: { status: 'up' },
        memory_heap: { status: 'up' },
        memory_rss: { status: 'up' },
        storage_uploads: { status: 'up' },
      },
      error: {},
      details: {
        database: { status: 'up' },
        memory_heap: { status: 'up' },
        memory_rss: { status: 'up' },
        storage_uploads: { status: 'up' },
      },
    });
    expect(prismaService.$queryRawUnsafe).toHaveBeenCalledWith('SELECT 1');
  });

  it('returns a sanitized ServiceUnavailableException when a dependency fails', async () => {
    prismaService.$queryRawUnsafe.mockRejectedValue(
      new Error('postgres connection terminated'),
    );

    await expect(service.ready()).rejects.toThrow(
      new ServiceUnavailableException('Service is not ready'),
    );
  });
});
