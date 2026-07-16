import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HealthService } from './health.service';

const runIntegration = process.env.RUN_HEALTH_INTEGRATION_TESTS === 'true';
const describeIntegration = runIntegration ? describe : describe.skip;

describeIntegration('HealthService readiness integration', () => {
  const databaseUrl = process.env.DATABASE_URL;
  let prisma: PrismaClient;
  let uploadsPath: string;

  beforeAll(async () => {
    if (!databaseUrl) {
      throw new Error(
        'DATABASE_URL is required for health readiness integration tests',
      );
    }

    uploadsPath = await mkdtemp(join(tmpdir(), 'psychology-app-health-'));
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
    await rm(uploadsPath, { recursive: true, force: true });
  });

  it('reports ready when PostgreSQL and the uploads directory are available', async () => {
    const service = new HealthService(
      prisma as never,
      { uploadsPath } as never,
    );

    await expect(service.ready()).resolves.toEqual({ status: 'UP' });
  });
});
