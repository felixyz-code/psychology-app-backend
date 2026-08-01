const ORGANIZATION_SLUG_MAX_LENGTH = 100;
const DEFAULT_BOOTSTRAP_SLUG = 'practice';

export function buildFreelancerBootstrapSlugCandidate(
  organizationName: string,
  attempt: number,
) {
  const baseSlug = normalizeOrganizationSlug(organizationName);
  if (attempt === 0) {
    return baseSlug;
  }

  const suffix = `-${attempt + 1}`;
  return `${baseSlug.slice(0, ORGANIZATION_SLUG_MAX_LENGTH - suffix.length)}${suffix}`;
}

export function normalizeOrganizationSlug(value: string) {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!normalized) {
    return DEFAULT_BOOTSTRAP_SLUG;
  }

  return normalized.slice(0, ORGANIZATION_SLUG_MAX_LENGTH);
}
