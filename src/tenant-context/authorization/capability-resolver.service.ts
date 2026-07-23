import { Injectable } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import {
  CapabilityDecision,
  OrganizationCapability,
} from './organization-capability';

type RoleCapabilityPolicy = Readonly<{
  allow: readonly OrganizationCapability[];
  conditional: readonly OrganizationCapability[];
}>;

const ALL_CAPABILITIES = new Set(Object.values(OrganizationCapability));

// Every Allow and Conditional cell is transcribed explicitly from the approved
// matrix. Anything absent is a denial; conditional entries never become an
// unconditional permission in this phase.
const ROLE_CAPABILITY_POLICY: Readonly<
  Record<MembershipRole, RoleCapabilityPolicy>
> = {
  [MembershipRole.OWNER]: {
    allow: Object.values(OrganizationCapability),
    conditional: [],
  },
  [MembershipRole.ADMIN]: {
    allow: [
      OrganizationCapability.ORGANIZATION_READ,
      OrganizationCapability.MEMBERSHIP_READ,
      OrganizationCapability.MEMBERSHIP_INVITE,
      OrganizationCapability.MEMBERSHIP_LEAVE,
      OrganizationCapability.INVITATION_READ,
      OrganizationCapability.INVITATION_CREATE,
      OrganizationCapability.PATIENT_READ,
      OrganizationCapability.PATIENT_CREATE,
      OrganizationCapability.PATIENT_UPDATE,
      OrganizationCapability.CLINICAL_READ,
      OrganizationCapability.CLINICAL_WRITE,
      OrganizationCapability.DOCUMENT_READ,
      OrganizationCapability.DOCUMENT_UPLOAD,
      OrganizationCapability.APPOINTMENT_READ,
      OrganizationCapability.APPOINTMENT_MANAGE,
      OrganizationCapability.FINANCE_READ,
      OrganizationCapability.FINANCE_MANAGE,
      OrganizationCapability.REPORT_READ,
    ],
    conditional: [
      OrganizationCapability.MEMBERSHIP_MANAGE_ROLE,
      OrganizationCapability.MEMBERSHIP_SUSPEND,
      OrganizationCapability.MEMBERSHIP_REACTIVATE,
      OrganizationCapability.MEMBERSHIP_REMOVE,
      OrganizationCapability.PATIENT_DELETE,
    ],
  },
  [MembershipRole.PSYCHOLOGIST]: {
    allow: [
      OrganizationCapability.ORGANIZATION_READ,
      OrganizationCapability.MEMBERSHIP_LEAVE,
      OrganizationCapability.PATIENT_CREATE,
    ],
    conditional: [
      OrganizationCapability.PATIENT_READ,
      OrganizationCapability.PATIENT_UPDATE,
      OrganizationCapability.CLINICAL_READ,
      OrganizationCapability.CLINICAL_WRITE,
      OrganizationCapability.DOCUMENT_READ,
      OrganizationCapability.DOCUMENT_UPLOAD,
      OrganizationCapability.APPOINTMENT_READ,
      OrganizationCapability.APPOINTMENT_MANAGE,
      OrganizationCapability.REPORT_READ,
    ],
  },
  [MembershipRole.RECEPTIONIST]: {
    allow: [
      OrganizationCapability.ORGANIZATION_READ,
      OrganizationCapability.MEMBERSHIP_LEAVE,
      OrganizationCapability.APPOINTMENT_READ,
    ],
    conditional: [
      OrganizationCapability.APPOINTMENT_MANAGE,
      OrganizationCapability.REPORT_READ,
    ],
  },
  [MembershipRole.BILLING]: {
    allow: [
      OrganizationCapability.ORGANIZATION_READ,
      OrganizationCapability.MEMBERSHIP_LEAVE,
      OrganizationCapability.FINANCE_READ,
      OrganizationCapability.FINANCE_MANAGE,
    ],
    conditional: [OrganizationCapability.REPORT_READ],
  },
  [MembershipRole.AUDITOR]: {
    allow: [
      OrganizationCapability.ORGANIZATION_READ,
      OrganizationCapability.MEMBERSHIP_LEAVE,
      OrganizationCapability.MEMBERSHIP_READ,
      OrganizationCapability.AUDIT_READ,
    ],
    conditional: [
      OrganizationCapability.PATIENT_READ,
      OrganizationCapability.CLINICAL_READ,
      OrganizationCapability.DOCUMENT_READ,
      OrganizationCapability.APPOINTMENT_READ,
      OrganizationCapability.FINANCE_READ,
      OrganizationCapability.REPORT_READ,
    ],
  },
  [MembershipRole.READ_ONLY]: {
    allow: [
      OrganizationCapability.ORGANIZATION_READ,
      OrganizationCapability.MEMBERSHIP_LEAVE,
    ],
    conditional: [
      OrganizationCapability.PATIENT_READ,
      OrganizationCapability.CLINICAL_READ,
      OrganizationCapability.DOCUMENT_READ,
      OrganizationCapability.APPOINTMENT_READ,
      OrganizationCapability.REPORT_READ,
    ],
  },
};

@Injectable()
export class CapabilityResolverService {
  resolve(role: string, capability: string): CapabilityDecision {
    if (!ALL_CAPABILITIES.has(capability as OrganizationCapability)) {
      return CapabilityDecision.DENY;
    }

    const policy = ROLE_CAPABILITY_POLICY[role as MembershipRole];
    if (!policy) {
      return CapabilityDecision.DENY;
    }

    if (policy.allow.includes(capability as OrganizationCapability)) {
      return CapabilityDecision.ALLOW;
    }

    if (policy.conditional.includes(capability as OrganizationCapability)) {
      return CapabilityDecision.CONDITIONAL;
    }

    return CapabilityDecision.DENY;
  }

  getUnconditionalCapabilities(
    role: string,
  ): readonly OrganizationCapability[] {
    const policy = ROLE_CAPABILITY_POLICY[role as MembershipRole];
    return Object.freeze(policy ? [...policy.allow] : []);
  }
}
