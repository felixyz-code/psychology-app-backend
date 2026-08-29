import {
  BadRequestException,
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
import { TransferPatientBranchDto } from './dto/transfer-patient-branch.dto';
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
        ...(createPatientDto.branchId || scope.branchId
          ? { branchId: createPatientDto.branchId ?? scope.branchId }
          : {}),
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

  async findAll(scope: PatientAccessScope) {
    this.requirePatientCapability(
      scope,
      OrganizationCapability.PATIENT_READ,
      'patients.find_all',
      {
        allowConditionalForAssignedProfessional: true,
        allowReceptionistBranchScope: true,
      },
    );

    if (scope.organizationRole === MembershipRole.RECEPTIONIST) {
      return this.findReceptionistPatients(scope);
    }

    return this.prisma.patient.findMany({
      where: this.visiblePatientWhere(scope),
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, scope: PatientAccessScope) {
    if (scope.organizationRole === MembershipRole.RECEPTIONIST) {
      this.requirePatientCapability(
        scope,
        OrganizationCapability.PATIENT_READ,
        'patients.find_one',
        { allowReceptionistBranchScope: true },
      );
      const accesses = await this.prisma.userBranchAccess.findMany({
        where: {
          userId: scope.userId,
          organizationId: scope.organizationId,
        },
        select: { branchId: true },
      });
      const allowedBranchIds = accesses.map((a) => a.branchId);
      if (allowedBranchIds.length === 0) {
        throw this.patientNotFound();
      }

      const patient = await this.prisma.patient.findFirst({
        where: {
          id,
          organizationId: scope.organizationId,
          OR: [
            { branchId: { in: allowedBranchIds } },
            {
              psychologist: {
                branchAccesses: {
                  some: {
                    branchId: { in: allowedBranchIds },
                    organizationId: scope.organizationId,
                  },
                },
              },
            },
          ],
        },
      });

      if (!patient) {
        throw this.patientNotFound();
      }
      return patient;
    }

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

  async transferBranch(
    id: string,
    dto: TransferPatientBranchDto,
    scope: PatientAccessScope,
  ) {
    this.requirePatientCapability(
      scope,
      OrganizationCapability.PATIENT_UPDATE,
      'patients.transfer',
      { allowConditionalForAssignedProfessional: true },
    );

    const patient = await this.prisma.patient.findFirst({
      where: {
        id,
        organizationId: scope.organizationId,
      },
    });

    if (!patient) {
      throw this.patientNotFound();
    }

    const targetBranch = await this.prisma.branch.findFirst({
      where: {
        id: dto.targetBranchId,
        organizationId: scope.organizationId,
        deletedAt: null,
        isActive: true,
      },
    });

    if (!targetBranch) {
      throw new NotFoundException(
        'Target branch not found or is inactive in this organization',
      );
    }

    const targetPsychologistId =
      dto.targetPsychologistId ?? patient.psychologistId;

    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId: targetPsychologistId,
        organizationId: scope.organizationId,
        status: 'ACTIVE',
        organization: { status: 'ACTIVE' },
      },
      select: { id: true },
    });

    if (!membership) {
      throw new NotFoundException(
        'Target psychologist not found or is not active in this organization',
      );
    }

    const branchAccess = await this.prisma.userBranchAccess.findUnique({
      where: {
        userId_branchId: {
          userId: targetPsychologistId,
          branchId: dto.targetBranchId,
        },
      },
    });

    if (!branchAccess) {
      throw new BadRequestException(
        'El profesional asignado no tiene acceso a la sede destino.',
      );
    }

    const isPsychologistChanged =
      targetPsychologistId !== patient.psychologistId;

    return this.prisma.$transaction(async (tx) => {
      if (isPsychologistChanged) {
        await tx.patientAssignment.updateMany({
          where: {
            patientId: patient.id,
            organizationId: scope.organizationId,
            status: PatientAssignmentStatus.ACTIVE,
          },
          data: {
            status: PatientAssignmentStatus.ENDED,
            endedAt: new Date(),
            closureReason: `TRANSFER_TO_BRANCH: ${dto.reason.trim()}`,
            closedByMembershipId: scope.membershipId,
          },
        });

        await tx.patientAssignment.create({
          data: {
            organizationId: scope.organizationId,
            patientId: patient.id,
            membershipId: membership.id,
            role: PatientAssignmentRole.PRIMARY,
            status: PatientAssignmentStatus.ACTIVE,
            createdByMembershipId: scope.membershipId,
            creationReason: `TRANSFERRED_FROM_BRANCH: ${dto.reason.trim()}`,
          },
        });
      }

      return tx.patient.update({
        where: { id: patient.id },
        data: {
          branchId: dto.targetBranchId,
          psychologistId: targetPsychologistId,
        },
      });
    });
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

  private visiblePatientWhere(
    scope: PatientAccessScope,
  ): Prisma.PatientWhereInput {
    let branchFilter: Prisma.PatientWhereInput = {};

    const hasBranchFilter =
      scope.branchId &&
      scope.branchId !== 'ALL' &&
      scope.branchId.trim() !== '';

    if (hasBranchFilter) {
      branchFilter = {
        OR: [
          { branchId: scope.branchId },
          {
            psychologist: {
              branchAccesses: {
                some: {
                  branchId: scope.branchId,
                  organizationId: scope.organizationId,
                },
              },
            },
          },
        ],
      };
    }

    if (
      scope.organizationRole === MembershipRole.OWNER ||
      scope.organizationRole === MembershipRole.ADMIN
    ) {
      return {
        organizationId: scope.organizationId,
        ...branchFilter,
      };
    }

    if (scope.organizationRole === MembershipRole.PSYCHOLOGIST) {
      return {
        ...this.assignedScopeWhere(scope),
        ...branchFilter,
      };
    }

    return {
      ...this.assignedScopeWhere(scope),
      ...branchFilter,
    };
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

  private async findReceptionistPatients(scope: PatientAccessScope) {
    const accesses = await this.prisma.userBranchAccess.findMany({
      where: {
        userId: scope.userId,
        organizationId: scope.organizationId,
      },
      select: { branchId: true },
    });
    const allowedBranchIds = accesses.map((a) => a.branchId);

    if (scope.branchId) {
      if (!allowedBranchIds.includes(scope.branchId)) {
        throw new ForbiddenException(
          'User does not have access to this branch',
        );
      }
      return this.prisma.patient.findMany({
        where: {
          organizationId: scope.organizationId,
          OR: [
            { branchId: scope.branchId },
            {
              psychologist: {
                branchAccesses: {
                  some: {
                    branchId: scope.branchId,
                    organizationId: scope.organizationId,
                  },
                },
              },
            },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (allowedBranchIds.length === 0) {
      return [];
    }

    return this.prisma.patient.findMany({
      where: {
        organizationId: scope.organizationId,
        OR: [
          { branchId: { in: allowedBranchIds } },
          {
            psychologist: {
              branchAccesses: {
                some: {
                  branchId: { in: allowedBranchIds },
                  organizationId: scope.organizationId,
                },
              },
            },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private requirePatientCapability(
    scope: PatientAccessScope,
    capability: OrganizationCapability,
    operation: string,
    options: {
      allowConditionalForAssignedProfessional?: boolean;
      allowReceptionistBranchScope?: boolean;
    } = {},
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

    if (
      decision === CapabilityDecision.CONDITIONAL &&
      options.allowReceptionistBranchScope &&
      scope.organizationRole === MembershipRole.RECEPTIONIST
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
