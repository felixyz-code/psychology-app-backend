import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import {
  QuotaExceededException,
  QuotaResource,
} from '../exceptions/quota-exceeded.exception';
import { QuotaGuard } from './quota.guard';
import { QuotaEnforcementService } from '../services/quota-enforcement.service';

describe('QuotaGuard', () => {
  let guard: QuotaGuard;
  let reflector: {
    getAllAndOverride: jest.Mock;
  };
  let quotaEnforcementService: {
    assertCanAddTherapist: jest.Mock;
    assertCanCreateBranch: jest.Mock;
    assertCanSendNotification: jest.Mock;
  };

  const orgId = 'org-44444444-4444-4000-8000-444444444444';

  beforeEach(async () => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };

    quotaEnforcementService = {
      assertCanAddTherapist: jest.fn(),
      assertCanCreateBranch: jest.fn(),
      assertCanSendNotification: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotaGuard,
        { provide: Reflector, useValue: reflector },
        { provide: QuotaEnforcementService, useValue: quotaEnforcementService },
      ],
    }).compile();

    guard = module.get<QuotaGuard>(QuotaGuard);
  });

  function createMockExecutionContext(
    request: Record<string, unknown>,
  ): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
        getNext: () => ({}),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  it('allows access when no @RequireQuota metadata is set on route', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    const context = createMockExecutionContext({});
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(
      quotaEnforcementService.assertCanAddTherapist,
    ).not.toHaveBeenCalled();
  });

  it('enforces THERAPISTS quota using tenantContext.organizationId', async () => {
    reflector.getAllAndOverride.mockReturnValue(QuotaResource.THERAPISTS);
    quotaEnforcementService.assertCanAddTherapist.mockResolvedValue(undefined);

    const context = createMockExecutionContext({
      tenantContext: { organizationId: orgId },
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(quotaEnforcementService.assertCanAddTherapist).toHaveBeenCalledWith(
      orgId,
    );
  });

  it('enforces BRANCHES quota using params.organizationId', async () => {
    reflector.getAllAndOverride.mockReturnValue(QuotaResource.BRANCHES);
    quotaEnforcementService.assertCanCreateBranch.mockResolvedValue(undefined);

    const context = createMockExecutionContext({
      params: { organizationId: orgId },
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(quotaEnforcementService.assertCanCreateBranch).toHaveBeenCalledWith(
      orgId,
    );
  });

  it('enforces NOTIFICATIONS quota using header x-organization-id', async () => {
    reflector.getAllAndOverride.mockReturnValue(QuotaResource.NOTIFICATIONS);
    quotaEnforcementService.assertCanSendNotification.mockResolvedValue(
      undefined,
    );

    const context = createMockExecutionContext({
      headers: { 'x-organization-id': orgId },
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(
      quotaEnforcementService.assertCanSendNotification,
    ).toHaveBeenCalledWith(orgId);
  });

  it('throws ForbiddenException when no organizationId can be derived from request context', async () => {
    reflector.getAllAndOverride.mockReturnValue(QuotaResource.THERAPISTS);

    const context = createMockExecutionContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
    expect(
      quotaEnforcementService.assertCanAddTherapist,
    ).not.toHaveBeenCalled();
  });

  it('propagates QuotaExceededException (402) thrown by service', async () => {
    reflector.getAllAndOverride.mockReturnValue(QuotaResource.THERAPISTS);
    quotaEnforcementService.assertCanAddTherapist.mockRejectedValue(
      new QuotaExceededException({
        resource: QuotaResource.THERAPISTS,
        currentUsage: 3,
        maxAllowed: 3,
        currentTier: 'STARTER',
        suggestedTier: 'PRO',
      }),
    );

    const context = createMockExecutionContext({
      tenantContext: { organizationId: orgId },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      QuotaExceededException,
    );
  });
});
