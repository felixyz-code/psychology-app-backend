import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  MembershipRole,
  PatientAssignmentStatus,
  Prisma,
} from '@prisma/client';
import {
  CapabilityDecision,
  OrganizationCapability,
} from './authorization/organization-capability';
import { OrganizationPolicyService } from './authorization/organization-policy.service';
import { TenantObservabilityService } from './tenant-observability.service';
import { ClinicalAccessScope } from './clinical-access.types';

@Injectable()
export class ClinicalAccessPolicyService {
  constructor(
    private readonly policy: OrganizationPolicyService,
    private readonly observability: TenantObservabilityService,
  ) {}

  tenantPatientWhere(scope: ClinicalAccessScope): Prisma.PatientWhereInput {
    return {
      organizationId: scope.organizationId,
      psychologistId: scope.userId,
    };
  }

  assignedPatientWhere(scope: ClinicalAccessScope): Prisma.PatientWhereInput {
    return {
      ...this.tenantPatientWhere(scope),
      assignments: { some: this.assignmentWhere(scope) },
    };
  }

  assignmentWhere(
    scope: ClinicalAccessScope,
  ): Prisma.PatientAssignmentWhereInput {
    return {
      organizationId: scope.organizationId,
      membershipId: scope.membershipId,
      status: PatientAssignmentStatus.ACTIVE,
      membership: {
        organizationId: scope.organizationId,
        userId: scope.userId,
        status: 'ACTIVE',
        organization: { status: 'ACTIVE' },
      },
    };
  }

  requireCapability(
    scope: ClinicalAccessScope,
    capability: OrganizationCapability,
    operation: string,
  ) {
    const decision = this.policy.decisionFor(scope, capability);
    if (decision === CapabilityDecision.ALLOW) {
      return;
    }

    if (
      decision === CapabilityDecision.CONDITIONAL &&
      scope.organizationRole === MembershipRole.PSYCHOLOGIST
    ) {
      return;
    }

    this.observability.capabilityDenied(scope, capability, operation);
    throw new ForbiddenException('Organization capability is required');
  }
}
