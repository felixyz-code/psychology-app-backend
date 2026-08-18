import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { parseLegacyBackfillManifest } from '../../src/prisma/legacy-backfill/manifest';
import {
  applyLegacyBackfill,
  BackfillBlockedError,
  createLegacyBackfillPlan,
} from '../../src/prisma/legacy-backfill/legacy-backfill.service';
import { buildBackfillReport } from '../../src/prisma/legacy-backfill/report';
import {
  assertApplyEnvironment,
  describeDatabase,
  parseBackfillCliOptions,
  safeError,
} from '../../src/prisma/legacy-backfill/safety';

async function main() {
  const options = parseBackfillCliOptions(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }
  if (options.mode === 'apply') {
    assertApplyEnvironment(databaseUrl, process.env);
  }

  const manifestPath = resolve(process.cwd(), options.manifestPath);
  const manifest = parseLegacyBackfillManifest(
    JSON.parse(await readFile(manifestPath, 'utf8')),
  );
  const database = describeDatabase(databaseUrl);
  const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
  const startedAt = Date.now();

  try {
    await prisma.$connect();
    if (options.mode === 'dry-run') {
      const plan = await createLegacyBackfillPlan(prisma, manifest);
      const report = buildBackfillReport({
        mode: options.mode,
        manifest,
        plan,
        durationMs: Date.now() - startedAt,
        database,
      });
      console.log(JSON.stringify(report, null, 2));
      if (plan.blockers.length > 0) {
        process.exitCode = 1;
      }
      return;
    }

    const result = await applyLegacyBackfill(prisma, manifest);
    console.log(
      JSON.stringify(
        buildBackfillReport({
          mode: options.mode,
          manifest,
          plan: result.plan,
          afterCounts: result.afterPlan.legacyCounts,
          durationMs: Date.now() - startedAt,
          database,
        }),
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  const blocked =
    error instanceof BackfillBlockedError ? error.plan.blockers : undefined;
  console.error(
    JSON.stringify(
      { result: 'FAILED', error: safeError(error), blockers: blocked },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
