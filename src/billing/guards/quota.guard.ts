import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_QUOTA_KEY } from '../decorators/require-quota.decorator';
import { QuotaResource } from '../exceptions/quota-exceeded.exception';
import { QuotaEnforcementService } from '../services/quota-enforcement.service';

type RequestWithTenant = {
  tenantContext?: { organizationId: string };
  params?: Record<string, string>;
  headers?: Record<string, string | string[]>;
  user?: { preferredOrganizationId?: string; organizationId?: string };
  body?: Record<string, unknown>;
};

@Injectable()
export class QuotaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly quotaEnforcementService: QuotaEnforcementService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const resource = this.reflector.getAllAndOverride<QuotaResource>(
      REQUIRE_QUOTA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!resource) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithTenant>();
    const organizationId = this.extractOrganizationId(request);

    if (!organizationId) {
      throw new ForbiddenException(
        'Tenant context or organization ID is required for quota enforcement',
      );
    }

    switch (resource) {
      case QuotaResource.THERAPISTS:
      case 'THERAPISTS' as QuotaResource:
        await this.quotaEnforcementService.assertCanAddTherapist(
          organizationId,
        );
        break;

      case QuotaResource.BRANCHES:
      case 'BRANCHES' as QuotaResource:
        await this.quotaEnforcementService.assertCanCreateBranch(
          organizationId,
        );
        break;

      case QuotaResource.NOTIFICATIONS:
      case 'NOTIFICATIONS' as QuotaResource:
        await this.quotaEnforcementService.assertCanSendNotification(
          organizationId,
        );
        break;

      default:
        break;
    }

    return true;
  }

  private extractOrganizationId(request: RequestWithTenant): string | null {
    if (request.tenantContext?.organizationId) {
      return request.tenantContext.organizationId;
    }

    if (request.params?.organizationId) {
      return request.params.organizationId;
    }

    const headerVal = request.headers?.['x-organization-id'];
    if (typeof headerVal === 'string' && headerVal.length > 0) {
      return headerVal;
    }

    if (request.user?.preferredOrganizationId) {
      return request.user.preferredOrganizationId;
    }

    if (request.user?.organizationId) {
      return request.user.organizationId;
    }

    if (typeof request.body?.organizationId === 'string') {
      return request.body.organizationId;
    }

    return null;
  }
}
