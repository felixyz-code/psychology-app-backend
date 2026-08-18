import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantContext } from '../../common/request-context/request-context.service';
import { REQUIRE_QUOTA_KEY } from '../entitlements.constants';
import { EntitlementsService } from '../entitlements.service';
import { QuotaRequirement } from '../entitlements.types';

type GuardRequest = {
  tenantContext?: TenantContext;
};

@Injectable()
export class QuotaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlementsService: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<QuotaRequirement>(
      REQUIRE_QUOTA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requirement) {
      return true;
    }

    const request = context.switchToHttp().getRequest<GuardRequest>();
    if (!request.tenantContext?.organizationId) {
      throw new ForbiddenException('Tenant context is required');
    }

    await this.entitlementsService.checkNumericQuota(
      request.tenantContext.organizationId,
      requirement.quotaKey,
      {
        proposedIncrement: requirement.increment ?? 1,
        throwOnExceeded: true,
      },
    );

    return true;
  }
}
