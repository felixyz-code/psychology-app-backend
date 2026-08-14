import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const backendRoot = resolve(__dirname, '..', '..');
const schema = readFileSync(
  resolve(backendRoot, 'prisma/schema.prisma'),
  'utf8',
);

const migrationsDir = resolve(backendRoot, 'prisma/migrations');
const commercialMigrationDir = readdirSync(migrationsDir).find((dir) =>
  dir.includes('add_commercial_core_and_entitlements'),
);
const migration = commercialMigrationDir
  ? readFileSync(
      resolve(migrationsDir, commercialMigrationDir, 'migration.sql'),
      'utf8',
    )
  : '';

describe('Commercial Core and Entitlements schema contract and migration', () => {
  it('defines the commercial enums in schema.prisma', () => {
    expect(schema).toContain('enum PlanTier {');
    expect(schema).toContain('FREE');
    expect(schema).toContain('PROFESSIONAL');
    expect(schema).toContain('ENTERPRISE');
    expect(schema).toContain('CUSTOM');

    expect(schema).toContain('enum BillingInterval {');
    expect(schema).toContain('MONTHLY');
    expect(schema).toContain('ANNUAL');
    expect(schema).toContain('LIFETIME');

    expect(schema).toContain('enum SubscriptionStatus {');
    expect(schema).toContain('TRIALING');
    expect(schema).toContain('ACTIVE');
    expect(schema).toContain('PAST_DUE');
    expect(schema).toContain('CANCELED');
    expect(schema).toContain('EXPIRED');

    expect(schema).toContain('enum PaymentProvider {');
    expect(schema).toContain('MANUAL');
    expect(schema).toContain('INTERNAL');
    expect(schema).toContain('STRIPE');
    expect(schema).toContain('MERCADOPAGO');

    expect(schema).toContain('enum EntitlementType {');
    expect(schema).toContain('NUMERIC');
    expect(schema).toContain('BOOLEAN');

    expect(schema).toContain('enum EntitlementCategory {');
    expect(schema).toContain('CAPACITY');
    expect(schema).toContain('FEATURE_FLAG');
    expect(schema).toContain('INTEGRATION');
    expect(schema).toContain('SUPPORT');
  });

  it('models Plan, Subscription, EntitlementDefinition, and PlanEntitlement with required fields in schema.prisma', () => {
    expect(schema).toContain('model Plan {');
    expect(schema).toMatch(/tier\s+PlanTier/);
    expect(schema).toMatch(/code\s+String\s+@unique\s+@db\.VarChar\(50\)/);
    expect(schema).toMatch(/subscriptions\s+Subscription\[\]/);
    expect(schema).toMatch(/entitlements\s+PlanEntitlement\[\]/);
    expect(schema).toContain('@@map("plans")');

    expect(schema).toContain('model Subscription {');
    expect(schema).toMatch(/organizationId\s+String\s+@db\.Uuid/);
    expect(schema).toMatch(/planId\s+String\s+@db\.Uuid/);
    expect(schema).toMatch(
      /status\s+SubscriptionStatus\s+@default\(TRIALING\)/,
    );
    expect(schema).toMatch(
      /externalProvider\s+PaymentProvider\s+@default\(MANUAL\)/,
    );
    expect(schema).toContain(
      'organization           Organization       @relation(fields: [organizationId], references: [id], onDelete: Restrict, onUpdate: Cascade)',
    );
    expect(schema).toContain(
      'plan                   Plan               @relation(fields: [planId], references: [id], onDelete: Restrict, onUpdate: Cascade)',
    );
    expect(schema).toContain('@@map("subscriptions")');

    expect(schema).toContain('model EntitlementDefinition {');
    expect(schema).toMatch(/key\s+String\s+@unique\s+@db\.VarChar\(100\)/);
    expect(schema).toMatch(/type\s+EntitlementType/);
    expect(schema).toMatch(
      /category\s+EntitlementCategory\s+@default\(FEATURE_FLAG\)/,
    );
    expect(schema).toMatch(/defaultValue\s+Json/);
    expect(schema).toMatch(/planEntitlements\s+PlanEntitlement\[\]/);
    expect(schema).toContain('@@map("entitlement_definitions")');

    expect(schema).toContain('model PlanEntitlement {');
    expect(schema).toMatch(/planId\s+String\s+@db\.Uuid/);
    expect(schema).toMatch(/entitlementDefinitionId\s+String\s+@db\.Uuid/);
    expect(schema).toMatch(/numericValue\s+Int\?\s+@db\.Integer/);
    expect(schema).toMatch(/booleanValue\s+Boolean\?/);
    expect(schema).toContain(
      'plan                    Plan                  @relation(fields: [planId], references: [id], onDelete: Cascade, onUpdate: Cascade)',
    );
    expect(schema).toContain(
      'definition              EntitlementDefinition @relation(fields: [entitlementDefinitionId], references: [id], onDelete: Restrict, onUpdate: Cascade)',
    );
    expect(schema).toContain('@@unique([planId, entitlementDefinitionId])');
    expect(schema).toContain('@@map("plan_entitlements")');
  });

  it('declares the relation from Organization to subscriptions in schema.prisma', () => {
    expect(schema).toMatch(/subscriptions\s+Subscription\[\]/);
  });

  it('creates the commercial tables, enums, indexes, and foreign keys in the migration SQL', () => {
    expect(migration).toContain('CREATE TYPE "PlanTier"');
    expect(migration).toContain('CREATE TYPE "BillingInterval"');
    expect(migration).toContain('CREATE TYPE "SubscriptionStatus"');
    expect(migration).toContain('CREATE TYPE "PaymentProvider"');
    expect(migration).toContain('CREATE TYPE "EntitlementType"');
    expect(migration).toContain('CREATE TYPE "EntitlementCategory"');

    expect(migration).toContain('CREATE TABLE "plans"');
    expect(migration).toContain('CREATE TABLE "subscriptions"');
    expect(migration).toContain('CREATE TABLE "entitlement_definitions"');
    expect(migration).toContain('CREATE TABLE "plan_entitlements"');

    expect(migration).toContain('CREATE UNIQUE INDEX "plans_code_key"');
    expect(migration).toContain(
      'CREATE INDEX "subscriptions_organizationId_status_idx"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "entitlement_definitions_key_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "plan_entitlements_planId_entitlementDefinitionId_key"',
    );

    expect(migration).toContain(
      'ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organizationId_fkey"',
    );
    expect(migration).toContain(
      'ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey"',
    );
    expect(migration).toContain(
      'ALTER TABLE "plan_entitlements" ADD CONSTRAINT "plan_entitlements_planId_fkey"',
    );
    expect(migration).toContain(
      'ALTER TABLE "plan_entitlements" ADD CONSTRAINT "plan_entitlements_entitlementDefinitionId_fkey"',
    );
  });
});
