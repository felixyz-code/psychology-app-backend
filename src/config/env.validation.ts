import { RuntimeConfig, NodeEnvironment } from './config.types';

const defaultCorsOrigins = ['http://localhost:4200', 'http://localhost:4201'];
const allowedNodeEnvironments: NodeEnvironment[] = [
  'development',
  'test',
  'production',
];
const jwtExpiresInPattern = /^\d+(ms|s|m|h|d|w|y)$/;

class RuntimeConfigValidationError extends Error {
  constructor(messages: string[]) {
    super(`Invalid runtime configuration: ${messages.join('; ')}`);
    this.name = 'RuntimeConfigValidationError';
  }
}

export function validateRuntimeEnv(env: NodeJS.ProcessEnv): RuntimeConfig {
  const errors: string[] = [];
  const databaseUrl = readRequired(env, 'DATABASE_URL', errors);
  const jwtSecret = readRequired(env, 'JWT_SECRET', errors);
  const jwtExpiresIn = readOptional(env, 'JWT_EXPIRES_IN') ?? '1d';
  const nodeEnv = readOptional(env, 'NODE_ENV') ?? 'development';
  const uploadsPath = readOptional(env, 'UPLOADS_PATH') ?? 'uploads';
  const corsOrigins = parseCorsOrigins(
    readOptional(env, 'CORS_ORIGIN'),
    errors,
    nodeEnv,
  );
  const swaggerEnabled = parseOptionalBoolean(
    readOptional(env, 'SWAGGER_ENABLED'),
    'SWAGGER_ENABLED',
    errors,
    nodeEnv,
  );
  const port = parsePort(readOptional(env, 'PORT'), errors);
  const trustProxyHops = parseTrustProxyHops(
    readOptional(env, 'TRUST_PROXY_HOPS'),
    errors,
  );

  if (databaseUrl && !isPostgresConnectionString(databaseUrl)) {
    errors.push('DATABASE_URL must be a PostgreSQL connection string');
  }

  if (jwtSecret && isPlaceholder(jwtSecret)) {
    errors.push('JWT_SECRET must not use a placeholder value');
  }

  if (jwtSecret && jwtSecret.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters long');
  }

  if (!jwtExpiresInPattern.test(jwtExpiresIn)) {
    errors.push('JWT_EXPIRES_IN must use a duration like 15m, 1h or 1d');
  }

  if (!uploadsPath.trim()) {
    errors.push('UPLOADS_PATH must not be empty when provided');
  }

  if (!allowedNodeEnvironments.includes(nodeEnv as NodeEnvironment)) {
    errors.push('NODE_ENV must be development, test or production');
  }

  if (nodeEnv === 'production') {
    if (!readOptional(env, 'UPLOADS_PATH')) {
      errors.push('UPLOADS_PATH is required in production');
    } else if (!isAbsolutePath(uploadsPath)) {
      errors.push('UPLOADS_PATH must be an absolute path in production');
    }
  }

  if (errors.length > 0) {
    throw new RuntimeConfigValidationError(errors);
  }

  return {
    databaseUrl,
    jwtSecret,
    jwtExpiresIn,
    port,
    nodeEnv: nodeEnv as NodeEnvironment,
    uploadsPath,
    corsOrigins,
    swaggerEnabled,
    trustProxyHops,
  };
}

function readRequired(env: NodeJS.ProcessEnv, key: string, errors: string[]) {
  const value = env[key]?.trim();

  if (!value) {
    errors.push(`${key} is required`);
    return '';
  }

  return value;
}

function readOptional(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key]?.trim();

  return value ? value : undefined;
}

function parsePort(value: string | undefined, errors: string[]) {
  if (!value) {
    return 3000;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push('PORT must be an integer between 1 and 65535');
    return 3000;
  }

  return port;
}

function parseCorsOrigins(
  value: string | undefined,
  errors: string[],
  nodeEnv: string,
) {
  if (!value) {
    if (nodeEnv === 'production') {
      errors.push('CORS_ORIGIN is required in production');
    }
    return defaultCorsOrigins;
  }

  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) {
    errors.push('CORS_ORIGIN must include at least one origin when provided');
    return defaultCorsOrigins;
  }

  if (origins.includes('*')) {
    errors.push('CORS_ORIGIN must not use wildcard origins');
  }

  for (const origin of origins) {
    try {
      const parsedUrl = new URL(origin);

      if (parsedUrl.origin !== origin) {
        errors.push('CORS_ORIGIN entries must be origins without paths');
      }
    } catch {
      errors.push('CORS_ORIGIN entries must be valid URL origins');
    }
  }

  return origins;
}

function parseTrustProxyHops(value: string | undefined, errors: string[]) {
  if (!value) {
    return 0;
  }

  const hops = Number(value);

  if (!Number.isInteger(hops) || hops < 0 || hops > 2) {
    errors.push('TRUST_PROXY_HOPS must be an integer between 0 and 2');
    return 0;
  }

  return hops;
}

function isAbsolutePath(value: string) {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);
}

function parseOptionalBoolean(
  value: string | undefined,
  key: string,
  errors: string[],
  nodeEnv: string,
) {
  if (value === undefined) {
    return nodeEnv !== 'production';
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  errors.push(`${key} must be true or false`);
  return true;
}

function isPostgresConnectionString(value: string) {
  try {
    const parsedUrl = new URL(value);

    return (
      (parsedUrl.protocol === 'postgresql:' ||
        parsedUrl.protocol === 'postgres:') &&
      Boolean(parsedUrl.hostname) &&
      parsedUrl.pathname.length > 1
    );
  } catch {
    return false;
  }
}

function isPlaceholder(value: string) {
  const normalizedValue = value.toLowerCase();

  return [
    'change_me',
    'changeme',
    'replace-me',
    'replace_me',
    'replace-with',
    'your-secret',
    'jwt-secret',
  ].some((placeholder) => normalizedValue.includes(placeholder));
}
