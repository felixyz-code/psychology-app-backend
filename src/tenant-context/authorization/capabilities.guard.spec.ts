import { ForbiddenException } from '@nestjs/common';
import { MembershipRole, UserRole } from '@prisma/client';
import { Reflector } from '@nestjs/core';
import {
  TenantContext,
  TenantResolutionMode,
} from '../../common/request-context/request-context.service';
import { CapabilitiesGuard } from './capabilities.guard';
import { OrganizationCapability } from './organization-capability';
import { OrganizationPolicyService } from './organization-policy.service';

describe('CapabilitiesGuard', () => {
  const policy = {
    requireCapabilities: jest.fn(),
  };
  const reflector = {
    getAllAndOverride: jest.fn(),
  };
  const guard = new CapabilitiesGuard(
    reflector as unknown as Reflector,
    policy as unknown as OrganizationPolicyService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('does nothing without explicit metadata', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(contextFor())).toBe(true);
    expect(policy.requireCapabilities).not.toHaveBeenCalled();
  });

  it('fails before policy evaluation when JWT identity or tenant context is absent', () => {
    reflector.getAllAndOverride.mockReturnValue([
      OrganizationCapability.PATIENT_CREATE,
    ]);
    expect(guard.canActivate(contextFor(undefined, tenant()))).toBe(false);
    expect(() => guard.canActivate(contextFor(user(), undefined))).toThrow(
      ForbiddenException,
    );
    expect(policy.requireCapabilities).not.toHaveBeenCalled();
  });

  it('delegates only validated tenant contexts to the central policy', () => {
    reflector.getAllAndOverride.mockReturnValue([
      OrganizationCapability.PATIENT_CREATE,
    ]);
    const validatedTenant = tenant();
    const requestContext = contextFor(user(), validatedTenant);

    expect(guard.canActivate(requestContext)).toBe(true);
    expect(policy.requireCapabilities).toHaveBeenCalledWith(
      validatedTenant,
      [OrganizationCapability.PATIENT_CREATE],
      '/patients',
    );
  });
});

function contextFor(
  userValue?: ReturnType<typeof user>,
  tenantValue?: TenantContext,
) {
  const request = {
    user: userValue,
    tenantContext: tenantValue,
    route: { path: '/patients' },
  };
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as import('@nestjs/common').ExecutionContext;
}

function user() {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'No PHI Used',
    email: 'test@example.test',
    role: UserRole.ADMIN,
  };
}

function tenant(): TenantContext {
  return Object.freeze({
    userId: '11111111-1111-4111-8111-111111111111',
    organizationId: '22222222-2222-4222-8222-222222222222',
    membershipId: '33333333-3333-4333-8333-333333333333',
    organizationRole: MembershipRole.ADMIN,
    legacyUserRole: UserRole.ADMIN,
    resolutionMode: TenantResolutionMode.EXPLICIT,
  });
}
