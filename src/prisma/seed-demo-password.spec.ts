import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MINIMUM_DEMO_SEED_PASSWORD_LENGTH,
  requireDemoSeedPassword,
} from '../../prisma/seed-demo-password';

const seedSource = readFileSync(
  resolve(__dirname, '../../prisma/seed.ts'),
  'utf8',
);

describe('requireDemoSeedPassword', () => {
  it.each([undefined, '', 'short'])(
    'rejects a missing or short demo seed password before seeding',
    (value) => {
      expect(() => requireDemoSeedPassword(value)).toThrow(
        'SEED_DEMO_PASSWORD is required',
      );
    },
  );

  it('returns an explicit password that meets the minimum length', () => {
    const password = 'seed-password-without-output';

    expect(password.length).toBeGreaterThanOrEqual(
      MINIMUM_DEMO_SEED_PASSWORD_LENGTH,
    );
    expect(requireDemoSeedPassword(password)).toBe(password);
  });

  it('validates the environment password before hashing or creating demo users', () => {
    const passwordValidation = seedSource.indexOf(
      'const demoPassword = requireDemoSeedPassword();',
    );
    const passwordHashing = seedSource.indexOf('bcrypt.hash(demoPassword, 10)');
    const adminCreation = seedSource.indexOf('const admin = await upsertUser');

    expect(passwordValidation).toBeGreaterThan(-1);
    expect(passwordHashing).toBeGreaterThan(passwordValidation);
    expect(adminCreation).toBeGreaterThan(passwordHashing);
  });

  it('keeps both demo roles without a hardcoded or logged password fallback', () => {
    expect(seedSource).toContain('role: UserRole.ADMIN');
    expect(seedSource).toContain('role: UserRole.PSYCHOLOGIST');
    expect(seedSource).not.toMatch(/DEFAULT_PASSWORD/);
    expect(seedSource).not.toMatch(
      /console\.log\([^\n]*(demoPassword|demoPasswordHash|DATABASE_URL)/,
    );
  });
});
