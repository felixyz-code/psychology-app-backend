import { Injectable, Logger } from '@nestjs/common';
import { OrganizationCapability } from './authorization/organization-capability';
import {
  RequestContextService,
  TenantContext,
} from '../common/request-context/request-context.service';

type TenantEvent =
  | 'tenant_resolution_succeeded'
  | 'tenant_context_ambiguous'
  | 'tenant_context_missing'
  | 'tenant_header_invalid'
  | 'tenant_selection_denied'
  | 'tenant_capability_denied';

@Injectable()
export class TenantObservabilityService {
  private readonly logger = new Logger(TenantObservabilityService.name);

  constructor(private readonly requestContext: RequestContextService) {}

  resolutionSucceeded(tenant: TenantContext) {
    this.write('tenant_resolution_succeeded', 'SUCCESS', {
      userId: tenant.userId,
      membershipId: tenant.membershipId,
      organizationId: tenant.organizationId,
      resolutionMode: tenant.resolutionMode,
    });
  }

  invalidHeader(userId: string) {
    this.write('tenant_header_invalid', 'DENY', {
      userId,
      reasonCode: 'INVALID_HEADER',
    });
  }

  selectionDenied(
    userId: string,
    reasonCode:
      | 'INELIGIBLE_ORGANIZATION'
      | 'INACTIVE_MEMBERSHIP'
      | 'INACTIVE_ORGANIZATION'
      | 'INCOHERENT_MEMBERSHIP',
    identifiers: { membershipId?: string; organizationId?: string } = {},
  ) {
    this.write('tenant_selection_denied', 'DENY', {
      userId,
      reasonCode,
      ...identifiers,
    });
  }

  ambiguousContext(userId: string) {
    this.write('tenant_context_ambiguous', 'UNRESOLVED', {
      userId,
      reasonCode: 'AMBIGUOUS_MEMBERSHIPS',
    });
  }

  missingRequiredContext(userId: string, reasonCode: string) {
    this.write('tenant_context_missing', 'DENY', { userId, reasonCode });
  }

  capabilityDenied(
    tenant: TenantContext,
    capability: OrganizationCapability,
    route: string,
  ) {
    this.write('tenant_capability_denied', 'DENY', {
      userId: tenant.userId,
      membershipId: tenant.membershipId,
      organizationId: tenant.organizationId,
      capability,
      route,
      reasonCode: 'CAPABILITY_DENIED',
    });
  }

  private write(event: TenantEvent, outcome: string, details: object) {
    this.logger.warn(
      JSON.stringify({
        event,
        outcome,
        requestId: this.requestContext.requestId ?? 'unavailable',
        ...details,
      }),
    );
  }
}
