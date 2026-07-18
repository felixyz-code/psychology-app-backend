export interface BackfillCliOptions {
  manifestPath: string;
  mode: 'dry-run' | 'apply';
}

export function parseBackfillCliOptions(args: string[]): BackfillCliOptions {
  let manifestPath: string | undefined;
  let dryRun = false;
  let apply = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--manifest') {
      const candidate = args[index + 1];
      if (!candidate || candidate.startsWith('--')) {
        throw new Error('--manifest <path> is required');
      }
      manifestPath = candidate;
      index += 1;
      continue;
    }
    if (argument === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (argument === '--apply') {
      apply = true;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!manifestPath) {
    throw new Error('--manifest <path> is required');
  }
  if (dryRun === apply) {
    throw new Error('Choose exactly one of --dry-run or --apply');
  }

  return { manifestPath, mode: apply ? 'apply' : 'dry-run' };
}

export function describeDatabase(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  return {
    host: url.hostname,
    port: url.port || '5432',
    database,
  };
}

export function assertApplyEnvironment(
  databaseUrl: string,
  env: NodeJS.ProcessEnv,
) {
  const database = describeDatabase(databaseUrl).database;
  const normalized = database.toLowerCase();

  if (env.BACKFILL_CONFIRMATION !== 'LEGACY_BACKFILL_APPLY') {
    throw new Error(
      'Apply requires BACKFILL_CONFIRMATION=LEGACY_BACKFILL_APPLY',
    );
  }
  if (/prod|production/.test(normalized)) {
    throw new Error(
      'Apply is blocked for database names that appear production-like',
    );
  }
  if (
    !normalized.endsWith('_test') &&
    env.BACKFILL_ALLOW_NON_TEST_DATABASE !== 'true'
  ) {
    throw new Error(
      'Apply requires a database ending in _test or BACKFILL_ALLOW_NON_TEST_DATABASE=true',
    );
  }
}

export function safeError(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: redactDatabaseUrls(error.message) };
  }
  return { name: 'UnknownError', message: 'An unknown error occurred' };
}

export function redactDatabaseUrls(value: string) {
  return value.replace(
    /postgres(?:ql)?:\/\/[^\s'"\]]+/gi,
    '[REDACTED_DATABASE_URL]',
  );
}
