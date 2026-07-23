import {
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  UserRole,
} from '@prisma/client';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { TenantResolutionMode } from '../common/request-context/request-context.service';
import { TenantResolutionFailure } from './tenant-context.types';
import { TenantResolverService } from './tenant-resolver.service';

const organizationA = '11111111-1111-4111-8111-111111111111';
const organizationB = '22222222-2222-4222-8222-222222222222';
const user: AuthenticatedUser = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Legacy Admin',
  email: 'legacy-admin@example.test',
  role: UserRole.ADMIN,
};

type Membership = {
  id: string;
  userId: string;
  organizationId: string;
  role: MembershipRole;
  status: MembershipStatus;
  organization: { id: string; status: OrganizationStatus };
};

describe('TenantResolverService', () => {
  let memberships: Membership[];
  let findMany: jest.Mock;
  let observability: { invalidHeader: jest.Mock; selectionDenied: jest.Mock };
  let service: TenantResolverService;

  beforeEach(() => {
    memberships = [];
    findMany = jest.fn(() => Promise.resolve(memberships));
    observability = {
      invalidHeader: jest.fn(),
      selectionDenied: jest.fn(),
    };
    service = new TenantResolverService(
      {
        organizationMembership: { findMany },
      } as unknown as PrismaService,
      observability as never,
    );
  });

  it('rejects invalid, empty, and duplicated selection headers before trusting them', async () => {
    await expect(
      resolve({ 'x-organization-id': 'not-a-uuid' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      resolve({ 'x-organization-id': '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      resolve({}, [
        'X-Organization-Id',
        organizationA,
        'x-organization-id',
        organizationB,
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findMany).not.toHaveBeenCalled();
    expect(observability.invalidHeader).toHaveBeenCalledTimes(3);
  });

  it('uses the only active membership and preserves separate legacy and organization roles', async () => {
    memberships = [membership(organizationA, MembershipRole.PSYCHOLOGIST)];

    const resolution = await resolve();
    expect(resolution.tenantContext).toMatchObject({
      userId: user.id,
      organizationId: organizationA,
      organizationRole: MembershipRole.PSYCHOLOGIST,
      legacyUserRole: UserRole.ADMIN,
      resolutionMode: TenantResolutionMode.SINGLE_MEMBERSHIP,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: user.id },
      }),
    );
  });

  it('requires explicit selection when more than one eligible membership exists', async () => {
    memberships = [membership(organizationA), membership(organizationB)];

    await expect(resolve()).resolves.toEqual({
      failure: TenantResolutionFailure.AMBIGUOUS_MEMBERSHIPS,
    });
  });

  it('validates an explicit organization against the authenticated user membership', async () => {
    memberships = [membership(organizationA)];

    const resolution = await resolve({ 'x-organization-id': organizationA });
    expect(resolution.tenantContext).toMatchObject({
      organizationId: organizationA,
      resolutionMode: TenantResolutionMode.EXPLICIT,
    });
    await expect(
      resolve({ 'x-organization-id': organizationB }),
    ).rejects.toMatchObject({
      status: 403,
      message: 'Organization access denied',
    });
  });

  it('does not turn missing, inactive, or foreign memberships into tenant access', async () => {
    await expect(resolve()).resolves.toEqual({
      failure: TenantResolutionFailure.NO_ACTIVE_MEMBERSHIP,
    });

    memberships = [
      membership(
        organizationA,
        MembershipRole.OWNER,
        OrganizationStatus.SUSPENDED,
      ),
    ];
    await expect(resolve()).resolves.toEqual({
      failure: TenantResolutionFailure.INELIGIBLE_ORGANIZATION,
    });
    await expect(
      resolve({ 'x-organization-id': organizationA }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(observability.selectionDenied).toHaveBeenLastCalledWith(
      user.id,
      'INACTIVE_ORGANIZATION',
      expect.objectContaining({ organizationId: organizationA }),
    );

    memberships = [
      {
        ...membership(organizationA),
        userId: '44444444-4444-4444-8444-444444444444',
      },
    ];
    await expect(
      resolve({ 'x-organization-id': organizationA }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects comma-separated, array, and whitespace-normalized values', async () => {
    await expect(
      resolve({ 'x-organization-id': `${organizationA},${organizationB}` }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      resolve({ 'x-organization-id': [organizationA, organizationB] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      resolve({ 'x-organization-id': ` ${organizationA}` }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects suspended, revoked, and invited rows as non-memberships', async () => {
    for (const status of [
      MembershipStatus.SUSPENDED,
      MembershipStatus.REVOKED,
      MembershipStatus.INVITED,
    ]) {
      memberships = [{ ...membership(organizationA), status }];
      await expect(
        resolve({ 'x-organization-id': organizationA }),
      ).rejects.toMatchObject({
        status: 403,
        message: 'Organization access denied',
      });
    }
  });

  function resolve(
    headers: Record<string, string | string[] | undefined> = {},
    rawHeaders?: string[],
  ) {
    return service.resolve(user, { headers, rawHeaders });
  }
});

function membership(
  organizationId: string,
  role: MembershipRole = MembershipRole.OWNER,
  status: OrganizationStatus = OrganizationStatus.ACTIVE,
): Membership {
  return {
    id: `membership-${organizationId}`,
    userId: user.id,
    organizationId,
    role,
    status: MembershipStatus.ACTIVE,
    organization: { id: organizationId, status },
  };
}
