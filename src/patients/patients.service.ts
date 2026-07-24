import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MembershipRole,
  PatientAssignmentRole,
  PatientAssignmentStatus,
  Prisma,
} from '@prisma/client';
import { DocumentsService } from '../documents/documents.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CapabilityDecision,
  OrganizationCapability,
} from '../tenant-context/authorization/organization-capability';
import { OrganizationPolicyService } from '../tenant-context/authorization/organization-policy.service';
import { TenantObservabilityService } from '../tenant-context/tenant-observability.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PatientAccessScope } from './types/patient-access-scope.type';

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentsService: DocumentsService,
    private readonly policy: OrganizationPolicyService,
    private readonly observability: TenantObservabilityService,
  ) {}

  create(createPatientDto: CreatePatientDto, scope: PatientAccessScope) {
    this.requirePatientCapability(
      scope,
      OrganizationCapability.PATIENT_CREATE,
      'patients.create',
    );

    return this.prisma.patient.create({
      data: {
        ...this.withoutOwnership(createPatientDto),
        organizationId: scope.organizationId,
        psychologistId: scope.userId,
        assignments: {
          create: {
            organizationId: scope.organizationId,
            membershipId: scope.membershipId,
            role: PatientAssignmentRole.PRIMARY,
            status: PatientAssignmentStatus.ACTIVE,
            createdByMembershipId: scope.membershipId,
            creationReason: 'PATIENT_CREATED_BY_ASSIGNED_PROFESSIONAL',
          },
        },
      },
    });
  }

  findAll(scope: PatientAccessScope) {
    this.requirePatientCapability(
      scope,
      OrganizationCapability.PATIENT_READ,
      'patients.find_all',
      { allowConditionalForAssignedProfessional: true },
    );

    return this.prisma.patient.findMany({
      where: this.assignedScopeWhere(scope),
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, scope: PatientAccessScope) {
    const patient = await this.findTenantPatientOrThrow(id, scope);
    this.requirePatientCapability(
      scope,
      OrganizationCapability.PATIENT_READ,
      'patients.find_one',
      { allowConditionalForAssignedProfessional: true },
    );
    await this.requireActiveAssignment(id, scope);
    return patient;
  }

  async update(
    id: string,
    updatePatientDto: UpdatePatientDto,
    scope: PatientAccessScope,
  ) {
    await this.findTenantPatientOrThrow(id, scope);
    this.requirePatientCapability(
      scope,
      OrganizationCapability.PATIENT_UPDATE,
      'patients.update',
      { allowConditionalForAssignedProfessional: true },
    );
    await this.requireActiveAssignment(id, scope);

    const result = await this.prisma.patient.updateMany({
      where: { id, ...this.assignedScopeWhere(scope) },
      data: this.withoutOwnership(updatePatientDto),
    });

    if (result.count !== 1) {
      throw this.patientNotFound();
    }

    // updateMany atomically applies the full ownership predicate before reread.
    return this.findAssignedPatientOrThrow(id, scope);
  }

  async remove(id: string, scope: PatientAccessScope) {
    const patient = await this.findTenantPatientOrThrow(id, scope);
    this.requirePatientCapability(
      scope,
      OrganizationCapability.PATIENT_DELETE,
      'patients.remove',
    );
    await this.requireActiveAssignment(id, scope);

    const documents = await this.prisma.document.findMany({
      where: {
        organizationId: scope.organizationId,
        caseFile: { patient: { id, ...this.assignedScopeWhere(scope) } },
      },
      select: { filePath: true },
    });

    await this.prisma.patientAssignment.deleteMany({
      where: {
        organizationId: scope.organizationId,
        patientId: id,
        patient: this.assignedScopeWhere(scope),
      },
    });

    const result = await this.prisma.patient.deleteMany({
      where: { id, ...this.scopeWhere(scope) },
    });

    if (result.count !== 1) {
      throw this.patientNotFound();
    }

    await this.documentsService.cleanupDocumentFiles(
      documents.map((document) => document.filePath),
    );

    return patient;
  }

  private scopeWhere(scope: PatientAccessScope): Prisma.PatientWhereInput {
    return {
      organizationId: scope.organizationId,
      psychologistId: scope.userId,
    };
  }

  private assignedScopeWhere(
    scope: PatientAccessScope,
  ): Prisma.PatientWhereInput {
    return {
      ...this.scopeWhere(scope),
      assignments: { some: this.assignmentWhere(scope) },
    };
  }

  private withoutOwnership<T extends object>(
    dto: T,
  ): Omit<T, 'organizationId' | 'psychologistId'> {
    const patientData = { ...dto };
    Reflect.deleteProperty(patientData, 'organizationId');
    Reflect.deleteProperty(patientData, 'psychologistId');
    return patientData;
  }

  private async findTenantPatientOrThrow(
    id: string,
    scope: PatientAccessScope,
  ) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, ...this.scopeWhere(scope) },
    });

    if (!patient) {
      throw this.patientNotFound();
    }

    return patient;
  }

  private async findAssignedPatientOrThrow(
    id: string,
    scope: PatientAccessScope,
  ) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, ...this.assignedScopeWhere(scope) },
    });

    if (!patient) {
      throw this.patientNotFound();
    }

    return patient;
  }

  private async requireActiveAssignment(
    patientId: string,
    scope: PatientAccessScope,
  ) {
    const assignment = await this.prisma.patientAssignment.findFirst({
      where: {
        ...this.assignmentWhere(scope),
        patientId,
        patient: this.scopeWhere(scope),
      },
      select: { id: true },
    });

    if (!assignment) {
      throw new ForbiddenException('Patient assignment is required');
    }
  }

  private assignmentWhere(
    scope: PatientAccessScope,
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

  private requirePatientCapability(
    scope: PatientAccessScope,
    capability: OrganizationCapability,
    operation: string,
    options: { allowConditionalForAssignedProfessional?: boolean } = {},
  ) {
    const decision = this.policy.decisionFor(scope, capability);
    if (decision === CapabilityDecision.ALLOW) {
      return;
    }

    if (
      decision === CapabilityDecision.CONDITIONAL &&
      options.allowConditionalForAssignedProfessional &&
      scope.organizationRole === MembershipRole.PSYCHOLOGIST
    ) {
      return;
    }

    this.observability.capabilityDenied(scope, capability, operation);
    throw new ForbiddenException('Organization capability is required');
  }

  private patientNotFound() {
    return new NotFoundException('Patient not found');
  }
}
