import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const backendRoot = resolve(__dirname, '..', '..');
const schemaPath = resolve(backendRoot, 'prisma/schema.prisma');
const migrationPath = resolve(
  backendRoot,
  'prisma/migrations/20260819170000_add_user_preferences/migration.sql',
);

describe('User Preferences schema contract', () => {
  const schema = readFileSync(schemaPath, 'utf8');
  const migration = readFileSync(migrationPath, 'utf8');

  it('models the UserPreferences entity and relations correctly in prisma', () => {
    expect(schema).toContain('model UserPreferences {');
    expect(schema).toContain('enum UserTimeFormat {');
    expect(schema).toContain('enum UserDateFormat {');
    expect(schema).toContain('emailNotifications     Boolean');
    expect(schema).toContain('inAppNotifications     Boolean');
    expect(schema).toContain('appointmentReminders   Boolean');
    expect(schema).toContain('reminderAdvanceMinutes Int');
    expect(schema).toContain('sessionDigest          Boolean');
    expect(schema).toContain('timeZone               String');
    expect(schema).toContain('timeFormat             UserTimeFormat');
    expect(schema).toContain('dateFormat             UserDateFormat');
    expect(schema).toContain('locale                 String');
    expect(schema).toContain('weekStartsOn           Int');
    expect(schema).toContain('preferences                     UserPreferences?');
    expect(schema).toContain('@@map("user_preferences")');
  });

  it('has valid additive migration SQL with proper foreign keys and constraints', () => {
    expect(migration).toContain('CREATE TYPE "UserTimeFormat"');
    expect(migration).toContain('CREATE TYPE "UserDateFormat"');
    expect(migration).toContain('CREATE TABLE "user_preferences"');
    expect(migration).toContain('ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey"');
    expect(migration).toContain('ON DELETE CASCADE ON UPDATE CASCADE');
  });
});
