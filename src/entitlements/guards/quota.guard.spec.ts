import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EntitlementKey } from '../entitlements.constants';
import { EntitlementsService } from '../entitlements.service';
import { QuotaGuard } from './quota.guard';

describe('QuotaGuard', () => {
  let guard: QuotaGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  let entitlementsService: { checkNumericQuota: jest.Mock };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    entitlementsService = { checkNumericQuota: jest.fn() };
    guard = new QuotaGuard(
      reflector as unknown as Reflector,
      entitlementsService as unknown as EntitlementsService,
    );
  });

  const createMockContext = (tenantContext?: { organizationId: string }) =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          tenantContext,
        }),
      }),
    }) as unknown as ExecutionContext;

  it('allows access when no @CheckQuota metadata is attached', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = createMockContext();

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(entitlementsService.checkNumericQuota).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when tenantContext is missing', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      quotaKey: EntitlementKey.MAX_PATIENTS,
      increment: 1,
    });
    const context = createMockContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('delegates to EntitlementsService with quota parameters when tenant context is present', async () => {
    const orgId = '11111111-1111-4000-8000-111111111111';
    reflector.getAllAndOverride.mockReturnValue({
      quotaKey: EntitlementKey.MAX_PATIENTS,
      increment: 1,
    });
    entitlementsService.checkNumericQuota.mockResolvedValue({ allowed: true });
    const context = createMockContext({ organizationId: orgId });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(entitlementsService.checkNumericQuota).toHaveBeenCalledWith(
      orgId,
      EntitlementKey.MAX_PATIENTS,
      {
        proposedIncrement: 1,
        throwOnExceeded: true,
      },
    );
  });
});
