import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EntitlementKey } from '../entitlements.constants';
import { EntitlementsService } from '../entitlements.service';
import { FeatureGateGuard } from './feature-gate.guard';

describe('FeatureGateGuard', () => {
  let guard: FeatureGateGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  let entitlementsService: { checkFeatureAccess: jest.Mock };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    entitlementsService = { checkFeatureAccess: jest.fn() };
    guard = new FeatureGateGuard(
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

  it('allows access when no @RequireFeature metadata is present', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = createMockContext();

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(entitlementsService.checkFeatureAccess).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException when tenantContext is missing', async () => {
    reflector.getAllAndOverride.mockReturnValue(EntitlementKey.CAN_EXPORT_PDF);
    const context = createMockContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('delegates to EntitlementsService with featureKey when tenant context is present', async () => {
    const orgId = '11111111-1111-4000-8000-111111111111';
    reflector.getAllAndOverride.mockReturnValue(EntitlementKey.CAN_EXPORT_PDF);
    entitlementsService.checkFeatureAccess.mockResolvedValue({ allowed: true });
    const context = createMockContext({ organizationId: orgId });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(entitlementsService.checkFeatureAccess).toHaveBeenCalledWith(
      orgId,
      EntitlementKey.CAN_EXPORT_PDF,
      true,
    );
  });
});
