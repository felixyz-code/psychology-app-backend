import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const backendRoot = resolve(__dirname, '..', '..');
const schema = readFileSync(
  resolve(backendRoot, 'prisma/schema.prisma'),
  'utf8',
);

const migrationsDir = resolve(backendRoot, 'prisma/migrations');
const auditMigrationDir = readdirSync(migrationsDir).find((dir) =>
  dir.includes('add_audit_log_entity'),
);
const migration = auditMigrationDir
  ? readFileSync(
      resolve(migrationsDir, auditMigrationDir, 'migration.sql'),
      'utf8',
    )
  : '';

describe('AuditLog schema contract and migration', () => {
  it('models the AuditLog entity with all required fields, relations, and indexes in schema.prisma', () => {
    expect(schema).toContain('model AuditLog {');
    expect(schema).toContain(
      'id             String        @id @default(uuid()) @db.Uuid',
    );
    expect(schema).toContain(
      'timestamp      DateTime      @default(now()) @db.Timestamptz(3)',
    );
    expect(schema).toContain('organizationId String?       @db.Uuid');
    expect(schema).toContain('userId         String?       @db.Uuid');
    expect(schema).toContain('action         String        @db.VarChar(100)');
    expect(schema).toContain('resourceType   String        @db.VarChar(100)');
    expect(schema).toContain('resourceId     String?       @db.VarChar(255)');
    expect(schema).toContain('ipAddress      String?       @db.VarChar(100)');
    expect(schema).toContain('userAgent      String?       @db.Text');
    expect(schema).toContain('details        Json?');
    expect(schema).toContain('@@index([organizationId, timestamp])');
    expect(schema).toContain('@@index([userId])');
    expect(schema).toContain('@@map("audit_logs")');
  });

  it('creates the audit_logs table, indexes, and foreign keys in the migration SQL', () => {
    expect(migration).toContain('CREATE TABLE "audit_logs"');
    expect(migration).toContain(
      'CREATE INDEX "audit_logs_organizationId_timestamp_idx"',
    );
    expect(migration).toContain('CREATE INDEX "audit_logs_userId_idx"');
    expect(migration).toContain(
      'CREATE INDEX "audit_logs_resourceType_resourceId_idx"',
    );
    expect(migration).toContain(
      'ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey"',
    );
    expect(migration).toContain(
      'ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey"',
    );
  });
});
