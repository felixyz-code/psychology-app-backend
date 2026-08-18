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

  it('validates the local seed password before hashing or creating tenant users', () => {
    const passwordValidation = seedSource.indexOf(
      'const demoPassword = requireDemoSeedPassword(',
    );
    const passwordHashing = seedSource.indexOf('bcrypt.hash(demoPassword, 10)');
    const tenantDataCreation = seedSource.indexOf(
      'await seedTenantDevelopmentData(passwordHash);',
    );

    expect(passwordValidation).toBeGreaterThan(-1);
    expect(passwordHashing).toBeGreaterThan(passwordValidation);
    expect(tenantDataCreation).toBeGreaterThan(passwordHashing);
  });

  it('keeps legacy user roles and does not log seed secrets', () => {
    expect(seedSource).toContain('UserRole.ADMIN');
    expect(seedSource).toContain('UserRole.PSYCHOLOGIST');
    expect(seedSource).toContain('DEFAULT_LOCAL_PASSWORD');
    expect(seedSource).not.toMatch(
      /console\.log\([^\n]*(demoPassword|demoPasswordHash|passwordHash|DATABASE_URL|DEFAULT_LOCAL_PASSWORD)/,
    );
  });
});
