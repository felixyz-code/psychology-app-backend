import { MembershipRole, OrganizationStatus } from '@prisma/client';

import { projectAuthContextCapabilities } from './capability-projection';

describe('projectAuthContextCapabilities', () => {
  it('emits only the closed V1 catalog in lexical order without aliases', () => {
    const resolver = {
      getUnconditionalCapabilities: jest
        .fn()
        .mockReturnValue([
          'report.read',
          'membership.invite',
          'organization.read',
          'clinical.read',
          'patient.read',
        ]),
    };

    expect(
      projectAuthContextCapabilities(
        MembershipRole.OWNER,
        OrganizationStatus.ACTIVE,
        resolver as never,
      ),
    ).toEqual(['organization.read', 'patient.read', 'report.read']);
  });

  it('removes operational capabilities from an administrative suspended context', () => {
    const resolver = {
      getUnconditionalCapabilities: jest
        .fn()
        .mockReturnValue([
          'organization.read',
          'organization.manage',
          'membership.read',
          'patient.read',
          'finance.read',
        ]),
    };

    expect(
      projectAuthContextCapabilities(
        MembershipRole.ADMIN,
        OrganizationStatus.SUSPENDED,
        resolver as never,
      ),
    ).toEqual(['organization.manage', 'organization.read']);
  });
});
