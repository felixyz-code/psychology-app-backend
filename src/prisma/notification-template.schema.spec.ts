import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const backendRoot = resolve(__dirname, '..', '..');
const schema = readFileSync(
  resolve(backendRoot, 'prisma/schema.prisma'),
  'utf8',
);

const migrationsDir = resolve(backendRoot, 'prisma/migrations');
const notifMigrationDir = readdirSync(migrationsDir).find((dir) =>
  dir.includes('subphase_12_2_notification_templates'),
);
const migration = notifMigrationDir
  ? readFileSync(
      resolve(migrationsDir, notifMigrationDir, 'migration.sql'),
      'utf8',
    )
  : '';

describe('NotificationTemplate schema contract and migration', () => {
  it('defines the notification enums in schema.prisma', () => {
    expect(schema).toContain('enum NotificationChannel {');
    expect(schema).toContain('EMAIL');
    expect(schema).toContain('SMS');
    expect(schema).toContain('WHATSAPP');

    expect(schema).toContain('enum NotificationEventType {');
    expect(schema).toContain('APPOINTMENT_CONFIRMATION');
    expect(schema).toContain('APPOINTMENT_REMINDER_24H');
    expect(schema).toContain('APPOINTMENT_REMINDER_2H');
    expect(schema).toContain('APPOINTMENT_RESCHEDULED');
    expect(schema).toContain('APPOINTMENT_CANCELLED');
  });

  it('models NotificationTemplate with required fields and relations in schema.prisma', () => {
    expect(schema).toContain('model NotificationTemplate {');
    expect(schema).toMatch(/channel\s+NotificationChannel/);
    expect(schema).toMatch(/eventType\s+NotificationEventType/);
    expect(schema).toMatch(/body\s+String/);
    expect(schema).toContain('@@unique([organizationId, channel, eventType])');
    expect(schema).toContain('@@index([organizationId, channel])');
    expect(schema).toContain('@@index([organizationId, eventType])');
    expect(schema).toContain('@@index([organizationId, isActive])');
    expect(schema).toContain('@@map("notification_templates")');
  });

  it('has a valid DDL migration creating notification_templates and enums', () => {
    expect(migration).toContain('CREATE TYPE "NotificationChannel" AS ENUM');
    expect(migration).toContain('CREATE TYPE "NotificationEventType" AS ENUM');
    expect(migration).toContain('CREATE TABLE "notification_templates"');
    expect(migration).toContain('"organization_id" UUID NOT NULL');
    expect(migration).toContain('"channel" "NotificationChannel" NOT NULL');
    expect(migration).toContain('"event_type" "NotificationEventType" NOT NULL');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "notification_templates_organization_id_channel_event_type_key"',
    );
  });
});
