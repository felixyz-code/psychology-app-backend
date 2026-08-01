import {
  buildFreelancerBootstrapSlugCandidate,
  normalizeOrganizationSlug,
} from './freelancer-bootstrap.util';

describe('freelancer bootstrap slug utility', () => {
  it('normalizes organization names into a stable slug base', () => {
    expect(normalizeOrganizationSlug(' Consultorio Ána Martínez ')).toBe(
      'consultorio-ana-martinez',
    );
  });

  it('falls back when the organization name does not contain slug-safe characters', () => {
    expect(normalizeOrganizationSlug('***')).toBe('practice');
  });

  it('adds a numeric retry suffix when the base slug conflicts', () => {
    expect(
      buildFreelancerBootstrapSlugCandidate('Consultorio Ana Martinez', 0),
    ).toBe('consultorio-ana-martinez');
    expect(
      buildFreelancerBootstrapSlugCandidate('Consultorio Ana Martinez', 1),
    ).toBe('consultorio-ana-martinez-2');
  });
});
