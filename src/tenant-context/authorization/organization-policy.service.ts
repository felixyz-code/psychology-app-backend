import { ForbiddenException, Injectable } from '@nestjs/common';
import { TenantContext } from '../../common/request-context/request-context.service';
import { TenantObservabilityService } from '../tenant-observability.service';
import {
  CapabilityDecision,
  OrganizationCapability,
} from './organization-capability';
import { CapabilityResolverService } from './capability-resolver.service';

@Injectable()
export class OrganizationPolicyService {
  constructor(
    private readonly capabilities: CapabilityResolverService,
    private readonly observability: TenantObservabilityService,
  ) {}

  decisionFor(
    tenant: TenantContext,
    capability: OrganizationCapability | string,
  ): CapabilityDecision {
    return this.capabilities.resolve(tenant.organizationRole, capability);
  }

  hasUnconditionalCapability(
    tenant: TenantContext,
    capability: OrganizationCapability | string,
  ): boolean {
    return this.decisionFor(tenant, capability) === CapabilityDecision.ALLOW;
  }

  requireCapabilities(
    tenant: TenantContext,
    capabilities: readonly OrganizationCapability[],
    route: string,
  ) {
    const denied = capabilities.find(
      (capability) => !this.hasUnconditionalCapability(tenant, capability),
    );
    if (denied) {
      this.observability.capabilityDenied(tenant, denied, route);
      throw new ForbiddenException('Organization capability is required');
    }
  }
}
