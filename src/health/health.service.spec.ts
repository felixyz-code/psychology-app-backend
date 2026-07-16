import { ServiceUnavailableException } from '@nestjs/common';
import { access } from 'node:fs/promises';
import { AppConfigService } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { HealthService } from './health.service';

jest.mock('node:fs/promises', () => ({
  access: jest.fn(),
  constants: { R_OK: 4, W_OK: 2 },
}));

describe('HealthService', () => {
  const prisma = { $queryRawUnsafe: jest.fn() };
  const config = { uploadsPath: 'uploads' } as AppConfigService;
  let service: HealthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HealthService(prisma as unknown as PrismaService, config);
  });

  it('reports liveness without dependencies', () => {
    expect(service.live()).toEqual({ status: 'UP' });
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('reports readiness when PostgreSQL and uploads are available', async () => {
    prisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }]);
    jest.mocked(access).mockResolvedValue(undefined);

    await expect(service.ready()).resolves.toEqual({ status: 'UP' });
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith('SELECT 1');
  });

  it('returns a sanitized degraded response when a dependency fails', async () => {
    prisma.$queryRawUnsafe.mockRejectedValue(
      new Error('postgres password leaked'),
    );
    jest.mocked(access).mockResolvedValue(undefined);

    await expect(service.ready()).rejects.toEqual(
      new ServiceUnavailableException('Service is not ready'),
    );
  });
});
