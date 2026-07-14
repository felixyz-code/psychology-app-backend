export const MINIMUM_DEMO_SEED_PASSWORD_LENGTH = 8;

export function requireDemoSeedPassword(
  value = process.env.SEED_DEMO_PASSWORD,
): string {
  if (!value || value.length < MINIMUM_DEMO_SEED_PASSWORD_LENGTH) {
    throw new Error(
      `SEED_DEMO_PASSWORD is required and must be at least ${MINIMUM_DEMO_SEED_PASSWORD_LENGTH} characters long`,
    );
  }

  return value;
}
