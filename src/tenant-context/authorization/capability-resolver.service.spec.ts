import { ForbiddenException } from '@nestjs/common';
import { MembershipRole, UserRole } from '@prisma/client';
import {
  TenantContext,
  TenantResolutionMode,
} from '../../common/request-context/request-context.service';
import { TenantObservabilityService } from '../tenant-observability.service';
import {
  CapabilityDecision,
  OrganizationCapability,
} from './organization-capability';
import { CapabilityResolverService } from './capability-resolver.service';
import { OrganizationPolicyService } from './organization-policy.service';

describe('CapabilityResolverService', () => {
  const resolver = new CapabilityResolverService();

  it.each(Object.values(MembershipRole))(
    'has an explicit, closed policy for %s',
    (role) => {
      expect(resolver.getUnconditionalCapabilities(role)).toEqual(
        expect.any(Array),
      );
      expect(
        resolver.resolve(role, OrganizationCapability.ORGANIZATION_READ),
      ).not.toBe(CapabilityDecision.DENY);
    },
  );

  it('fails closed for unrecognized roles and undefined capabilities', () => {
    expect(
      resolver.resolve('FUTURE_ROLE', OrganizationCapability.ORGANIZATION_READ),
    ).toBe(CapabilityDecision.DENY);
    expect(resolver.resolve(MembershipRole.OWNER, 'unknown.capability')).toBe(
      CapabilityDecision.DENY,
    );
  });

  it('does not convert conditional Auditor or Read Only capabilities into grants', () => {
    expect(
      resolver.resolve(
        MembershipRole.AUDITOR,
        OrganizationCapability.CLINICAL_READ,
      ),
    ).toBe(CapabilityDecision.CONDITIONAL);
    expect(
      resolver.resolve(
        MembershipRole.READ_ONLY,
        OrganizationCapability.PATIENT_READ,
      ),
    ).toBe(CapabilityDecision.CONDITIONAL);
    expect(
      resolver.getUnconditionalCapabilities(MembershipRole.AUDITOR),
    ).not.toContain(OrganizationCapability.CLINICAL_READ);
    expect(
      resolver.getUnconditionalCapabilities(MembershipRole.READ_ONLY),
    ).not.toContain(OrganizationCapability.PATIENT_READ);
  });

  it('grants the explicit financial summary capability only to financial roles', () => {
    expect(
      resolver.resolve(
        MembershipRole.OWNER,
        OrganizationCapability.FINANCE_SUMMARY_READ,
      ),
    ).toBe(CapabilityDecision.ALLOW);
    expect(
      resolver.resolve(
        MembershipRole.ADMIN,
        OrganizationCapability.FINANCE_SUMMARY_READ,
      ),
    ).toBe(CapabilityDecision.ALLOW);
    expect(
      resolver.resolve(
        MembershipRole.BILLING,
        OrganizationCapability.FINANCE_SUMMARY_READ,
      ),
    ).toBe(CapabilityDecision.ALLOW);
    expect(
      resolver.resolve(
        MembershipRole.PSYCHOLOGIST,
        OrganizationCapability.FINANCE_SUMMARY_READ,
      ),
    ).toBe(CapabilityDecision.DENY);
    expect(
      resolver.resolve(
        MembershipRole.RECEPTIONIST,
        OrganizationCapability.FINANCE_SUMMARY_READ,
      ),
    ).toBe(CapabilityDecision.DENY);
    expect(
      resolver.resolve(
        MembershipRole.AUDITOR,
        OrganizationCapability.FINANCE_SUMMARY_READ,
      ),
    ).toBe(CapabilityDecision.DENY);
    expect(
      resolver.resolve(
        MembershipRole.READ_ONLY,
        OrganizationCapability.FINANCE_SUMMARY_READ,
      ),
    ).toBe(CapabilityDecision.DENY);
  });

  it('grants assessment template management capability to OWNER and ADMIN, conditional for PSYCHOLOGIST', () => {
    expect(
      resolver.resolve(
        MembershipRole.OWNER,
        OrganizationCapability.ASSESSMENT_TEMPLATE_MANAGE,
      ),
    ).toBe(CapabilityDecision.ALLOW);
    expect(
      resolver.resolve(
        MembershipRole.ADMIN,
        OrganizationCapability.ASSESSMENT_TEMPLATE_MANAGE,
      ),
    ).toBe(CapabilityDecision.ALLOW);
    expect(
      resolver.resolve(
        MembershipRole.PSYCHOLOGIST,
        OrganizationCapability.ASSESSMENT_TEMPLATE_MANAGE,
      ),
    ).toBe(CapabilityDecision.CONDITIONAL);
    expect(
      resolver.resolve(
        MembershipRole.RECEPTIONIST,
        OrganizationCapability.ASSESSMENT_TEMPLATE_MANAGE,
      ),
    ).toBe(CapabilityDecision.DENY);
    expect(
      resolver.resolve(
        MembershipRole.BILLING,
        OrganizationCapability.ASSESSMENT_TEMPLATE_MANAGE,
      ),
    ).toBe(CapabilityDecision.DENY);
  });

  it('grants audit.read capability to OWNER, ADMIN, and AUDITOR', () => {
    expect(
      resolver.resolve(
        MembershipRole.OWNER,
        OrganizationCapability.AUDIT_READ,
      ),
    ).toBe(CapabilityDecision.ALLOW);
    expect(
      resolver.resolve(
        MembershipRole.ADMIN,
        OrganizationCapability.AUDIT_READ,
      ),
    ).toBe(CapabilityDecision.ALLOW);
    expect(
      resolver.resolve(
        MembershipRole.AUDITOR,
        OrganizationCapability.AUDIT_READ,
      ),
    ).toBe(CapabilityDecision.ALLOW);
    expect(
      resolver.resolve(
        MembershipRole.PSYCHOLOGIST,
        OrganizationCapability.AUDIT_READ,
      ),
    ).toBe(CapabilityDecision.DENY);
    expect(
      resolver.resolve(
        MembershipRole.RECEPTIONIST,
        OrganizationCapability.AUDIT_READ,
      ),
    ).toBe(CapabilityDecision.DENY);
    expect(
      resolver.resolve(
        MembershipRole.BILLING,
        OrganizationCapability.AUDIT_READ,
      ),
    ).toBe(CapabilityDecision.DENY);
  });

  it('does not treat report.read as a financial summary substitute', () => {
    expect(
      resolver.resolve(
        MembershipRole.RECEPTIONIST,
        OrganizationCapability.REPORT_READ,
      ),
    ).toBe(CapabilityDecision.CONDITIONAL);
    expect(
      resolver.resolve(
        MembershipRole.RECEPTIONIST,
        OrganizationCapability.FINANCE_SUMMARY_READ,
      ),
    ).toBe(CapabilityDecision.DENY);
  });

  it('keeps invitation revoke and resend owner-only while allowing admin list/create', () => {
    expect(
      resolver.resolve(
        MembershipRole.OWNER,
        OrganizationCapability.INVITATION_REVOKE,
      ),
    ).toBe(CapabilityDecision.ALLOW);
    expect(
      resolver.resolve(
        MembershipRole.OWNER,
        OrganizationCapability.INVITATION_RESEND,
      ),
    ).toBe(CapabilityDecision.ALLOW);
    expect(
      resolver.resolve(
        MembershipRole.ADMIN,
        OrganizationCapability.INVITATION_READ,
      ),
    ).toBe(CapabilityDecision.ALLOW);
    expect(
      resolver.resolve(
        MembershipRole.ADMIN,
        OrganizationCapability.INVITATION_CREATE,
      ),
    ).toBe(CapabilityDecision.ALLOW);
    expect(
      resolver.resolve(
        MembershipRole.ADMIN,
        OrganizationCapability.INVITATION_REVOKE,
      ),
    ).toBe(CapabilityDecision.DENY);
    expect(
      resolver.resolve(
        MembershipRole.ADMIN,
        OrganizationCapability.INVITATION_RESEND,
      ),
    ).toBe(CapabilityDecision.DENY);
  });

  it('does not infer organizational capabilities from a legacy user role', () => {
    const observability = { capabilityDenied: jest.fn() };
    const policy = new OrganizationPolicyService(
      resolver,
      observability as unknown as TenantObservabilityService,
    );
    const tenant = context(MembershipRole.READ_ONLY);

    expect(tenant.legacyUserRole).toBe(UserRole.ADMIN);
    expect(
      policy.hasUnconditionalCapability(
        tenant,
        OrganizationCapability.PATIENT_CREATE,
      ),
    ).toBe(false);

    expect(() =>
      policy.requireCapabilities(
        tenant,
        [OrganizationCapability.PATIENT_READ],
        '/patients',
      ),
    ).toThrow(ForbiddenException);
    expect(observability.capabilityDenied).toHaveBeenCalledWith(
      tenant,
      OrganizationCapability.PATIENT_READ,
      '/patients',
    );
  });
});

function context(organizationRole: MembershipRole): TenantContext {
  return Object.freeze({
    userId: '11111111-1111-4111-8111-111111111111',
    organizationId: '22222222-2222-4222-8222-222222222222',
    membershipId: '33333333-3333-4333-8333-333333333333',
    organizationRole,
    legacyUserRole: UserRole.ADMIN,
    resolutionMode: TenantResolutionMode.EXPLICIT,
  });
}
