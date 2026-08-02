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
  | 'tenant_capability_denied'
  | 'freelancer_bootstrap_completed'
  | 'freelancer_bootstrap_denied'
  | 'active_organization_preference_changed';

export type OrganizationDomainEvent =
  | 'organization_updated'
  | 'organization_suspended'
  | 'organization_reactivated'
  | 'organization_ownership_transferred'
  | 'invitation_created'
  | 'invitation_revoked'
  | 'invitation_resent'
  | 'invitation_accepted'
  | 'invitation_rejected'
  | 'invitation_expired'
  | 'membership_role_changed'
  | 'membership_suspended'
  | 'membership_reactivated'
  | 'membership_removed'
  | 'membership_leave_denied'
  | 'owner_invariant_denied';

type OrganizationDomainMetadata = {
  actorUserId?: string;
  targetId?: string;
  targetUserId?: string;
  previousInvitationId?: string;
  newInvitationId?: string;
  sourceMembershipId?: string;
  targetMembershipId?: string;
  previousRole?: string;
  newRole?: string;
  sourcePreviousRole?: string;
  sourceNewRole?: string;
  targetPreviousRole?: string;
  targetNewRole?: string;
  previousStatus?: string;
  newStatus?: string;
};

type PreferenceChangeMetadata = {
  userId: string;
  preferredOrganizationId?: string;
  previousPreferredOrganizationId?: string;
};

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

  organizationDomainEvent(
    event: OrganizationDomainEvent,
    tenant: Pick<TenantContext, 'userId' | 'membershipId' | 'organizationId'>,
    outcome: 'SUCCESS' | 'DENY' | 'CONFLICT',
    reasonCode: string,
    metadata: OrganizationDomainMetadata = {},
  ) {
    this.logger.log(
      JSON.stringify({
        event,
        outcome,
        requestId: this.requestContext.requestId ?? 'unavailable',
        userId: tenant.userId,
        membershipId: tenant.membershipId,
        organizationId: tenant.organizationId,
        reasonCode,
        ...metadata,
      }),
    );
  }

  freelancerBootstrapCompleted(bootstrap: {
    userId: string;
    organizationId: string;
    membershipId: string;
  }) {
    this.logger.log(
      JSON.stringify({
        event: 'freelancer_bootstrap_completed',
        outcome: 'SUCCESS',
        requestId: this.requestContext.requestId ?? 'unavailable',
        reasonCode: 'BOOTSTRAP_COMPLETED',
        ...bootstrap,
      }),
    );
  }

  freelancerBootstrapDenied(
    reasonCode: 'REGISTRATION_CONFLICT' | 'SLUG_CONFLICT' | 'RATE_LIMITED',
    ipAddress: string,
  ) {
    this.logger.warn(
      JSON.stringify({
        event: 'freelancer_bootstrap_denied',
        outcome: 'DENY',
        requestId: this.requestContext.requestId ?? 'unavailable',
        reasonCode,
        ipAddress,
      }),
    );
  }

  activeOrganizationPreferenceChanged(
    outcome: 'SUCCESS' | 'DENY',
    reasonCode:
      | 'PREFERENCE_UPDATED'
      | 'PREFERENCE_CLEARED'
      | 'INELIGIBLE_ORGANIZATION'
      | 'INACTIVE_MEMBERSHIP'
      | 'INACTIVE_ORGANIZATION',
    metadata: PreferenceChangeMetadata,
  ) {
    const entry = {
      event: 'active_organization_preference_changed',
      outcome,
      requestId: this.requestContext.requestId ?? 'unavailable',
      reasonCode,
      ...metadata,
    };

    if (outcome === 'SUCCESS') {
      this.logger.log(JSON.stringify(entry));
      return;
    }

    this.logger.warn(JSON.stringify(entry));
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
