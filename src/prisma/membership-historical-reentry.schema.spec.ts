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
    'prisma/migrations/20260729030000_membership_historical_reentry/migration.sql',
  ),
  'utf8',
);

describe('membership historical re-entry schema contract', () => {
  it('removes the absolute organization membership uniqueness from the live schema', () => {
    expect(schema).toContain('@@index([organizationId, userId])');
    expect(schema).toContain('@@index([organizationId, userId, createdAt])');
    expect(schema).not.toContain('@@unique([organizationId, userId])');
  });

  it('creates a SQL-managed partial unique index for non-terminal memberships', () => {
    expect(migration).toContain(
      'DROP INDEX "organization_memberships_organizationId_userId_key";',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "organization_memberships_active_window_key"',
    );
    expect(migration).toContain(
      `WHERE "status" IN ('INVITED', 'ACTIVE', 'SUSPENDED')`,
    );
    expect(migration).toContain(
      'CREATE INDEX "organization_memberships_organizationId_userId_idx"',
    );
  });

  it('fails closed when legacy duplicate non-terminal memberships would violate the new rule', () => {
    expect(migration).toContain(
      'duplicate non-terminal memberships already exist',
    );
  });
});
