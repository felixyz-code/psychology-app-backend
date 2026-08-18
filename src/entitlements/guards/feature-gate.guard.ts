import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantContext } from '../../common/request-context/request-context.service';
import { REQUIRE_FEATURE_KEY } from '../entitlements.constants';
import { EntitlementsService } from '../entitlements.service';

type GuardRequest = {
  tenantContext?: TenantContext;
};

@Injectable()
export class FeatureGateGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlementsService: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const featureKey = this.reflector.getAllAndOverride<string>(
      REQUIRE_FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!featureKey) {
      return true;
    }

    const request = context.switchToHttp().getRequest<GuardRequest>();
    if (!request.tenantContext?.organizationId) {
      throw new ForbiddenException('Tenant context is required');
    }

    await this.entitlementsService.checkFeatureAccess(
      request.tenantContext.organizationId,
      featureKey,
      true,
    );

    return true;
  }
}
