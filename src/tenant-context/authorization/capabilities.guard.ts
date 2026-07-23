import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import { TenantContext } from '../../common/request-context/request-context.service';
import { OrganizationPolicyService } from './organization-policy.service';
import { OrganizationCapability } from './organization-capability';
import { REQUIRED_CAPABILITIES_KEY } from './require-capabilities.decorator';

type CapabilityRequest = {
  user?: AuthenticatedUser;
  tenantContext?: TenantContext;
  route?: { path?: string };
  baseUrl?: string;
};

@Injectable()
export class CapabilitiesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly policy: OrganizationPolicyService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const capabilities = this.reflector.getAllAndOverride<
      OrganizationCapability[]
    >(REQUIRED_CAPABILITIES_KEY, [context.getHandler(), context.getClass()]);
    if (!capabilities?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<CapabilityRequest>();
    // JWT and TenantContext guards are registered before this reusable guard.
    // The defensive checks preserve that order when it is tested in isolation.
    if (!request.user) {
      return false;
    }
    if (!request.tenantContext) {
      throw new ForbiddenException('Tenant context is required');
    }

    this.policy.requireCapabilities(
      request.tenantContext,
      capabilities,
      request.route?.path ?? request.baseUrl ?? 'unknown-route',
    );
    return true;
  }
}
