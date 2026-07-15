import { validateRuntimeEnv } from './env.validation';

const validSecret = '0123456789abcdef0123456789abcdef';

function createValidEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    DATABASE_URL:
      'postgresql://app_user:app_password@localhost:5432/psychology_app?schema=public',
    JWT_SECRET: validSecret,
    ...overrides,
  };
}

describe('validateRuntimeEnv', () => {
  const previousEnv = process.env;

  beforeEach(() => {
    process.env = { ...previousEnv };
  });

  afterEach(() => {
    process.env = previousEnv;
  });

  it('accepts the minimal valid runtime configuration', () => {
    const config = validateRuntimeEnv(createValidEnv());

    expect(config).toMatchObject({
      databaseUrl:
        'postgresql://app_user:app_password@localhost:5432/psychology_app?schema=public',
      jwtSecret: validSecret,
      jwtExpiresIn: '1d',
      port: 3000,
      nodeEnv: 'development',
      uploadsPath: 'uploads',
      corsOrigins: ['http://localhost:4200', 'http://localhost:4201'],
      swaggerEnabled: true,
    });
  });

  it('requires DATABASE_URL', () => {
    const env = createValidEnv();
    delete env.DATABASE_URL;

    expect(() => validateRuntimeEnv(env)).toThrow('DATABASE_URL is required');
  });

  it('requires JWT_SECRET', () => {
    const env = createValidEnv();
    delete env.JWT_SECRET;

    expect(() => validateRuntimeEnv(env)).toThrow('JWT_SECRET is required');
  });

  it('rejects a short JWT_SECRET', () => {
    expect(() =>
      validateRuntimeEnv(createValidEnv({ JWT_SECRET: 'short-secret' })),
    ).toThrow('JWT_SECRET must be at least 32 characters long');
  });

  it('does not expose the invalid JWT_SECRET in the error message', () => {
    const leakedSecret = 'change_me-secret-value-that-should-not-appear';

    expect(() =>
      validateRuntimeEnv(createValidEnv({ JWT_SECRET: leakedSecret })),
    ).toThrow(/JWT_SECRET/);

    try {
      validateRuntimeEnv(createValidEnv({ JWT_SECRET: leakedSecret }));
    } catch (error) {
      expect((error as Error).message).not.toContain(leakedSecret);
    }
  });

  it('rejects an invalid PORT', () => {
    expect(() => validateRuntimeEnv(createValidEnv({ PORT: '70000' }))).toThrow(
      'PORT must be an integer between 1 and 65535',
    );
  });

  it('rejects an invalid JWT_EXPIRES_IN', () => {
    expect(() =>
      validateRuntimeEnv(createValidEnv({ JWT_EXPIRES_IN: 'tomorrow' })),
    ).toThrow('JWT_EXPIRES_IN must use a duration like 15m, 1h or 1d');
  });

  it('rejects an invalid NODE_ENV', () => {
    expect(() =>
      validateRuntimeEnv(createValidEnv({ NODE_ENV: 'local' })),
    ).toThrow('NODE_ENV must be development, test or production');
  });

  it('keeps the local UPLOADS_PATH default when it is not provided', () => {
    const config = validateRuntimeEnv(createValidEnv());

    expect(config.uploadsPath).toBe('uploads');
  });

  it('disables Swagger by default in production', () => {
    const config = validateRuntimeEnv(
      createValidEnv({ NODE_ENV: 'production' }),
    );

    expect(config.swaggerEnabled).toBe(false);
  });

  it('enables Swagger by default outside production', () => {
    const config = validateRuntimeEnv(
      createValidEnv({ NODE_ENV: 'development' }),
    );

    expect(config.swaggerEnabled).toBe(true);
  });

  it.each([
    ['true', true],
    ['false', false],
  ])('uses the explicit SWAGGER_ENABLED=%s override', (value, expected) => {
    const config = validateRuntimeEnv(
      createValidEnv({
        NODE_ENV: 'production',
        SWAGGER_ENABLED: value,
      }),
    );

    expect(config.swaggerEnabled).toBe(expected);
  });
});
