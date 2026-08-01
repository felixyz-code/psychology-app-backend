import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const backendRoot = resolve(__dirname, '..', '..');
const schema = readFileSync(
  resolve(backendRoot, 'prisma/schema.prisma'),
  'utf8',
);
const migration = readFileSync(
  resolve(
    backendRoot,
    'prisma/migrations/20260801120000_add_user_normalized_email_bootstrap_runtime/migration.sql',
  ),
  'utf8',
);

describe('user email identity persistence schema contract', () => {
  it('adds a canonical normalizedEmail field to the live user schema', () => {
    expect(schema).toContain(
      'email                 String                   @unique @db.VarChar(255)',
    );
    expect(schema).toContain(
      'normalizedEmail       String                   @unique @db.VarChar(255)',
    );
  });

  it('backfills the canonical key and protects it with a unique index', () => {
    expect(migration).toContain('ADD COLUMN "normalizedEmail" VARCHAR(255);');
    expect(migration).toContain(
      `regexp_replace("email", '^[[:space:]]+|[[:space:]]+$', '', 'g')`,
    );
    expect(migration).toContain(
      'SET "normalizedEmail" = candidates.normalized_email',
    );
    expect(migration).toContain('ALTER COLUMN "normalizedEmail" SET NOT NULL;');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "users_normalizedEmail_key"',
    );
  });

  it('fails closed when legacy emails cannot be canonicalized safely', () => {
    expect(migration).toContain('blank legacy email exists');
    expect(migration).toContain('unsupported non-ASCII legacy email exists');
    expect(migration).toContain('normalized legacy email exceeds 255 bytes');
    expect(migration).toContain('duplicate canonical users already exist');
  });
});
