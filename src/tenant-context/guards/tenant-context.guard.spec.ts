import { ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { MembershipRole, UserRole } from '@prisma/client';
import { Reflector } from '@nestjs/core';
import {
  RequestContextService,
  TenantResolutionMode,
} from '../../common/request-context/request-context.service';
import { TenantResolutionFailure } from '../tenant-context.types';
import { TenantContextGuard } from './tenant-context.guard';

const tenantContext = Object.freeze({
  userId: '33333333-3333-4333-8333-333333333333',
  organizationId: '11111111-1111-4111-8111-111111111111',
  membershipId: '55555555-5555-4555-8555-555555555555',
  organizationRole: MembershipRole.OWNER,
  legacyUserRole: UserRole.ADMIN,
  resolutionMode: TenantResolutionMode.EXPLICIT,
});

describe('TenantContextGuard', () => {
  let resolver: { resolve: jest.Mock };
  let requestContext: RequestContextService;
  let metadata: Record<string, boolean | undefined>;
  let guard: TenantContextGuard;

  beforeEach(() => {
    resolver = { resolve: jest.fn() };
    requestContext = new RequestContextService();
    metadata = {};
    const reflector = {
      getAllAndOverride: jest.fn((key: string) => metadata[key]),
    };
    guard = new TenantContextGuard(
      reflector as unknown as Reflector,
      resolver as never,
      requestContext,
    );
  });

  it('makes legacy authenticated routes optional while exposing a validated context when available', async () => {
    resolver.resolve.mockResolvedValue({ tenantContext });
    const request = requestWithUser();

    await requestContext.run('request-a', () =>
      guard.canActivate(contextFor(request)),
    );

    expect(request.tenantContext).toBe(tenantContext);
    expect(resolver.resolve).toHaveBeenCalledWith(request.user, request);
  });

  it('allows legacy compatibility without a context, but fails closed on required routes', async () => {
    resolver.resolve.mockResolvedValue({
      failure: TenantResolutionFailure.NO_ACTIVE_MEMBERSHIP,
    });
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    await expect(
      requestContext.run('optional', () =>
        guard.canActivate(contextFor(requestWithUser())),
      ),
    ).resolves.toBe(true);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('tenant_context_unresolved'),
    );
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('headers'));

    metadata.tenantContextRequired = true;
    await expect(
      requestContext.run('required', () =>
        guard.canActivate(contextFor(requestWithUser())),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns a redacted conflict for an ambiguous required request and bypasses public routes', async () => {
    resolver.resolve.mockResolvedValue({
      failure: TenantResolutionFailure.AMBIGUOUS_MEMBERSHIPS,
    });
    metadata.tenantContextRequired = true;
    await expect(
      requestContext.run('ambiguous', () =>
        guard.canActivate(contextFor(requestWithUser())),
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    metadata = { isPublic: true };
    await expect(
      guard.canActivate(contextFor(requestWithUser())),
    ).resolves.toBe(true);
    expect(resolver.resolve).toHaveBeenCalledTimes(1);
  });

  it('gives explicit bypass metadata precedence over required tenant metadata', async () => {
    metadata = { skipTenantContext: true, tenantContextRequired: true };

    await expect(
      guard.canActivate(contextFor(requestWithUser())),
    ).resolves.toBe(true);
    expect(resolver.resolve).not.toHaveBeenCalled();
  });
});

type GuardRequest = {
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
  };
  headers: Record<string, string | string[] | undefined>;
  tenantContext?: typeof tenantContext;
};

function requestWithUser(): GuardRequest {
  return {
    user: {
      id: tenantContext.userId,
      name: 'Tenant User',
      email: 'tenant@example.test',
      role: UserRole.ADMIN,
    },
    headers: {},
  };
}

function contextFor(request: GuardRequest) {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}
