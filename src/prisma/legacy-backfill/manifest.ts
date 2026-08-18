import { OrganizationStatus } from '@prisma/client';

export interface LegacyBackfillManifest {
  version: 1;
  organization: {
    slug: string;
    legalName: string;
    displayName: string;
    status: OrganizationStatus;
  };
  owner: {
    userId: string;
  };
}

const organizationStatuses = new Set(Object.values(OrganizationStatus));
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class ManifestValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid legacy backfill manifest: ${issues.join('; ')}`);
    this.name = 'ManifestValidationError';
  }
}

export function parseLegacyBackfillManifest(
  value: unknown,
): LegacyBackfillManifest {
  const issues: string[] = [];

  if (!isPlainObject(value)) {
    throw new ManifestValidationError(['the root value must be an object']);
  }

  rejectUnknownKeys(
    value,
    ['version', 'organization', 'owner'],
    'root',
    issues,
  );
  const organization = readObject(value, 'organization', issues);
  const owner = readObject(value, 'owner', issues);

  if (value.version !== 1) {
    issues.push('version must be exactly 1');
  }

  if (organization) {
    rejectUnknownKeys(
      organization,
      ['slug', 'legalName', 'displayName', 'status'],
      'organization',
      issues,
    );
  }
  if (owner) {
    rejectUnknownKeys(owner, ['userId'], 'owner', issues);
  }

  const slug = readRequiredString(organization, 'slug', 'organization', issues);
  const legalName = readRequiredString(
    organization,
    'legalName',
    'organization',
    issues,
  );
  const displayName = readRequiredString(
    organization,
    'displayName',
    'organization',
    issues,
  );
  const status = readRequiredString(
    organization,
    'status',
    'organization',
    issues,
  );
  const userId = readRequiredString(owner, 'userId', 'owner', issues);

  if (slug) {
    if (!slugPattern.test(slug)) {
      issues.push('organization.slug must be lowercase kebab-case');
    }
    if (slug.length > 100) {
      issues.push('organization.slug must not exceed 100 characters');
    }
  }
  if (legalName && legalName.length > 255) {
    issues.push('organization.legalName must not exceed 255 characters');
  }
  if (displayName && displayName.length > 150) {
    issues.push('organization.displayName must not exceed 150 characters');
  }
  if (status && !organizationStatuses.has(status as OrganizationStatus)) {
    issues.push('organization.status is not a supported OrganizationStatus');
  }
  if (userId && !uuidPattern.test(userId)) {
    issues.push('owner.userId must be a UUID');
  }

  if (
    issues.length > 0 ||
    !slug ||
    !legalName ||
    !displayName ||
    !status ||
    !userId
  ) {
    throw new ManifestValidationError(issues);
  }

  return {
    version: 1,
    organization: {
      slug,
      legalName,
      displayName,
      status: status as OrganizationStatus,
    },
    owner: { userId },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readObject(
  value: Record<string, unknown>,
  key: string,
  issues: string[],
) {
  if (!isPlainObject(value[key])) {
    issues.push(`${key} must be an object`);
    return undefined;
  }
  return value[key];
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: string[],
  path: string,
  issues: string[],
) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      issues.push(`${path}.${key} is not allowed`);
    }
  }
}

function readRequiredString(
  value: Record<string, unknown> | undefined,
  key: string,
  path: string,
  issues: string[],
) {
  const candidate = value?.[key];
  if (typeof candidate !== 'string' || !candidate.trim()) {
    issues.push(`${path}.${key} must be a non-empty string`);
    return undefined;
  }
  return candidate.trim();
}
