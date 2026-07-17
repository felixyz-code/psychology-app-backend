import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const backendRoot = resolve(__dirname, '..', '..');
const schemaPath = resolve(backendRoot, 'prisma/schema.prisma');
const migrationPath = resolve(
  backendRoot,
  'prisma/migrations/20260717120000_add_saas_foundation/migration.sql',
);

describe('SaaS foundation schema contract', () => {
  const schema = readFileSync(schemaPath, 'utf8');
  const migration = readFileSync(migrationPath, 'utf8');

  it('models the additive organization foundation and nullable legacy scopes', () => {
    expect(schema).toContain('model Organization {');
    expect(schema).toContain('model OrganizationMembership {');
    expect(schema).toContain('model PsychologistProfile {');
    expect(schema).toContain('model PatientAssignment {');
    expect(schema).toContain('organizationId        String?');
    expect(schema).toContain('@@unique([organizationId, userId])');
    expect(schema).toContain('userId           String                    @unique');
  });

  it('keeps the migration additive and free of legacy data mutation', () => {
    expect(migration).toContain('CREATE TABLE "organizations"');
    expect(migration).toContain('ALTER TABLE "patients" ADD COLUMN "organizationId" UUID;');
    expect(migration).toContain('ALTER TABLE "financial_transactions" ADD COLUMN "organizationId" UUID;');
    expect(migration).not.toMatch(/DROP\s+(TABLE|COLUMN|TYPE)/i);
    expect(migration).not.toMatch(/ALTER\s+COLUMN.+SET\s+NOT\s+NULL/i);
    expect(migration).not.toMatch(/UPDATE\s+"/i);
    expect(migration).not.toMatch(/INSERT\s+INTO\s+"organizations"/i);
  });
});
