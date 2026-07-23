import { Module } from '@nestjs/common';
import { RequestContextService } from '../common/request-context/request-context.service';
import { CapabilitiesGuard } from './authorization/capabilities.guard';
import { CapabilityResolverService } from './authorization/capability-resolver.service';
import { OrganizationPolicyService } from './authorization/organization-policy.service';
import { TenantContextGuard } from './guards/tenant-context.guard';
import { TenantObservabilityService } from './tenant-observability.service';
import { TenantResolverService } from './tenant-resolver.service';

@Module({
  providers: [
    TenantResolverService,
    TenantContextGuard,
    RequestContextService,
    TenantObservabilityService,
    CapabilityResolverService,
    OrganizationPolicyService,
    CapabilitiesGuard,
  ],
  exports: [
    TenantResolverService,
    TenantContextGuard,
    RequestContextService,
    TenantObservabilityService,
    CapabilityResolverService,
    OrganizationPolicyService,
    CapabilitiesGuard,
  ],
})
export class TenantContextModule {}
