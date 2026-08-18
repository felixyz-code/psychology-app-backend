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
    'prisma/migrations/20260723120000_add_invitation_membership_lifecycle/migration.sql',
  ),
  'utf8',
);

describe('invitation lifecycle persistence schema contract', () => {
  it('uses timestamp-derived lifecycle and recipient binding fields', () => {
    expect(schema).toContain(
      'normalizedEmail  String         @db.VarChar(255)',
    );
    expect(schema).toContain('invitedUserId    String?        @db.Uuid');
    expect(schema).toContain('acceptedByUserId String?        @db.Uuid');
    expect(schema).toContain(
      'rejectedAt       DateTime?      @db.Timestamptz(3)',
    );
    expect(schema).toContain(
      'expiredAt        DateTime?      @db.Timestamptz(3)',
    );
    expect(schema).not.toContain('enum InvitationStatus');
  });

  it('certifies SQL-managed terminal-state and pending-duplicate protections', () => {
    expect(migration).toContain(
      'organization_invitations_one_terminal_state_check',
    );
    expect(migration).toContain(
      'num_nonnulls("acceptedAt", "rejectedAt", "revokedAt", "expiredAt") <= 1',
    );
    expect(migration).toContain(
      'organization_invitations_organizationId_normalizedEmail_pending_key',
    );
    expect(migration).toContain('WHERE "acceptedAt" IS NULL');
    expect(migration).not.toMatch(/expiresAt"\s*>\s*now\s*\(\s*\)/i);
  });

  it('fails closed for legacy rows that cannot obtain a safe normalized key', () => {
    expect(migration).toContain('blank legacy email exists');
    expect(migration).toContain('normalized legacy email exceeds 255 bytes');
    expect(migration).toContain('duplicate legacy pending invitations exist');
  });
});
