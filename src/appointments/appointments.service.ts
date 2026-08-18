import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MembershipRole,
  PatientAssignmentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CapabilityDecision,
  OrganizationCapability,
} from '../tenant-context/authorization/organization-capability';
import { OrganizationPolicyService } from '../tenant-context/authorization/organization-policy.service';
import type { ClinicalAccessScope } from '../tenant-context/clinical-access.types';
import { TenantObservabilityService } from '../tenant-context/tenant-observability.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

type AppointmentScope = ClinicalAccessScope;
type AuthorizedAppointment = Prisma.AppointmentGetPayload<{
  include: { patient: { select: { id: true; psychologistId: true } } };
}>;

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: OrganizationPolicyService,
    private readonly observability: TenantObservabilityService,
  ) {}

  async create(
    createAppointmentDto: CreateAppointmentDto,
    scope: AppointmentScope,
  ) {
    this.requireAppointmentCapability(
      scope,
      OrganizationCapability.APPOINTMENT_MANAGE,
      'appointments.create',
      {
        allowReceptionistOperational: !hasProvided(
          createAppointmentDto,
          'notes',
        ),
      },
    );

    const patient = await this.getTenantPatientOrThrow(
      createAppointmentDto.patientId,
      scope,
    );
    await this.ensureTenantProfessionalOrThrow(
      createAppointmentDto.psychologistId,
      scope,
    );
    this.requirePsychologistScopeForTarget(
      createAppointmentDto.psychologistId,
      scope,
    );
    if (hasProvided(createAppointmentDto, 'notes')) {
      await this.requireNotesWrite(patient.id, scope);
    }

    const appointment = await this.prisma.appointment.create({
      data: {
        ...this.withoutServerFields(createAppointmentDto),
        organizationId: scope.organizationId,
      },
      include: { patient: { select: { id: true, psychologistId: true } } },
    });

    return this.projectAppointment(
      appointment,
      await this.canReadNotes(appointment.patientId, scope),
    );
  }

  async findAll(scope: AppointmentScope) {
    this.requireAppointmentCapability(
      scope,
      OrganizationCapability.APPOINTMENT_READ,
      'appointments.find_all',
    );

    const appointments = await this.prisma.appointment.findMany({
      where: this.visibleAppointmentWhere(scope),
      include: { patient: { select: { id: true, psychologistId: true } } },
      orderBy: {
        scheduledAt: 'desc',
      },
    });

    return this.projectAppointments(appointments, scope);
  }

  async findOne(id: string, scope: AppointmentScope) {
    this.requireAppointmentCapability(
      scope,
      OrganizationCapability.APPOINTMENT_READ,
      'appointments.find_one',
    );
    const appointment = await this.getVisibleAppointmentOrThrow(id, scope);

    return this.projectAppointment(
      appointment,
      await this.canReadNotes(appointment.patientId, scope),
    );
  }

  async findByPatientId(patientId: string, scope: AppointmentScope) {
    this.requireAppointmentCapability(
      scope,
      OrganizationCapability.APPOINTMENT_READ,
      'appointments.find_by_patient',
    );
    await this.getTenantPatientOrThrow(patientId, scope);
    if (scope.organizationRole === MembershipRole.PSYCHOLOGIST) {
      await this.requireAssignment(patientId, scope);
    }

    const appointments = await this.prisma.appointment.findMany({
      where: {
        patientId,
        ...this.visibleAppointmentWhere(scope),
      },
      include: { patient: { select: { id: true, psychologistId: true } } },
      orderBy: {
        scheduledAt: 'desc',
      },
    });

    return this.projectAppointments(appointments, scope);
  }

  async update(
    id: string,
    updateAppointmentDto: UpdateAppointmentDto,
    scope: AppointmentScope,
  ) {
    const existingAppointment = await this.getVisibleAppointmentOrThrow(
      id,
      scope,
    );
    this.requireAppointmentCapability(
      scope,
      OrganizationCapability.APPOINTMENT_MANAGE,
      'appointments.update',
      {
        allowReceptionistOperational: !hasProvided(
          updateAppointmentDto,
          'notes',
        ),
      },
    );

    const patientId =
      updateAppointmentDto.patientId ?? existingAppointment.patientId;
    if (updateAppointmentDto.patientId) {
      await this.getTenantPatientOrThrow(updateAppointmentDto.patientId, scope);
    }

    const psychologistId =
      updateAppointmentDto.psychologistId ?? existingAppointment.psychologistId;
    if (updateAppointmentDto.psychologistId) {
      await this.ensureTenantProfessionalOrThrow(
        updateAppointmentDto.psychologistId,
        scope,
      );
    }
    this.requirePsychologistScopeForTarget(psychologistId, scope);
    if (hasProvided(updateAppointmentDto, 'notes')) {
      await this.requireNotesWrite(patientId, scope);
    }

    const result = await this.prisma.appointment.updateMany({
      where: {
        id,
        organizationId: scope.organizationId,
      },
      data: this.withoutServerFields(updateAppointmentDto),
    });

    if (result.count !== 1) {
      throw this.appointmentNotFound();
    }

    const appointment = await this.getVisibleAppointmentOrThrow(id, scope);
    return this.projectAppointment(
      appointment,
      await this.canReadNotes(appointment.patientId, scope),
    );
  }

  async remove(id: string, scope: AppointmentScope) {
    const appointment = await this.getVisibleAppointmentOrThrow(id, scope);
    this.requireAppointmentCapability(
      scope,
      OrganizationCapability.APPOINTMENT_MANAGE,
      'appointments.remove',
      { allowReceptionistOperational: true },
    );

    const result = await this.prisma.appointment.deleteMany({
      where: {
        id: appointment.id,
        organizationId: scope.organizationId,
      },
    });

    if (result.count !== 1) {
      throw this.appointmentNotFound();
    }

    return this.projectAppointment(appointment, false);
  }

  private visibleAppointmentWhere(
    scope: AppointmentScope,
  ): Prisma.AppointmentWhereInput {
    return {
      organizationId: scope.organizationId,
      ...(scope.organizationRole === MembershipRole.PSYCHOLOGIST
        ? {
            OR: [
              { psychologistId: scope.userId },
              {
                patient: {
                  assignments: { some: this.assignmentWhere(scope) },
                },
              },
            ],
          }
        : {}),
    };
  }

  private async getVisibleAppointmentOrThrow(
    id: string,
    scope: AppointmentScope,
  ) {
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id,
        ...this.visibleAppointmentWhere(scope),
      },
      include: { patient: { select: { id: true, psychologistId: true } } },
    });

    if (!appointment) {
      throw this.appointmentNotFound();
    }

    return appointment;
  }

  private async getTenantPatientOrThrow(
    patientId: string,
    scope: AppointmentScope,
  ) {
    const patient = await this.prisma.patient.findFirst({
      where: {
        id: patientId,
        organizationId: scope.organizationId,
      },
      select: { id: true, psychologistId: true },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    return patient;
  }

  private async ensureTenantProfessionalOrThrow(
    userId: string,
    scope: AppointmentScope,
  ) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId,
        organizationId: scope.organizationId,
        status: 'ACTIVE',
        organization: { status: 'ACTIVE' },
      },
      select: { id: true },
    });

    if (!membership) {
      throw new NotFoundException('Psychologist not found');
    }
  }

  private requirePsychologistScopeForTarget(
    psychologistId: string,
    scope: AppointmentScope,
  ) {
    if (
      scope.organizationRole === MembershipRole.PSYCHOLOGIST &&
      psychologistId !== scope.userId
    ) {
      throw new ForbiddenException('Appointment capability is required');
    }
  }

  private async projectAppointments(
    appointments: AuthorizedAppointment[],
    scope: AppointmentScope,
  ) {
    return Promise.all(
      appointments.map(async (appointment) =>
        this.projectAppointment(
          appointment,
          await this.canReadNotes(appointment.patientId, scope),
        ),
      ),
    );
  }

  private projectAppointment(
    appointment: AuthorizedAppointment,
    includeNotes: boolean,
  ) {
    const projected = { ...appointment };
    Reflect.deleteProperty(projected, 'patient');
    if (!includeNotes) {
      Reflect.deleteProperty(projected, 'notes');
    }
    return projected;
  }

  private async canReadNotes(patientId: string, scope: AppointmentScope) {
    if (
      !this.hasClinicalCapability(scope, OrganizationCapability.CLINICAL_READ)
    ) {
      return false;
    }

    return this.hasAssignment(patientId, scope);
  }

  private async requireNotesWrite(patientId: string, scope: AppointmentScope) {
    if (
      !this.hasClinicalCapability(scope, OrganizationCapability.CLINICAL_WRITE)
    ) {
      this.observability.capabilityDenied(
        scope,
        OrganizationCapability.CLINICAL_WRITE,
        'appointments.notes',
      );
      throw new ForbiddenException('Clinical capability is required');
    }

    await this.requireAssignment(patientId, scope);
  }

  private hasClinicalCapability(
    scope: AppointmentScope,
    capability: OrganizationCapability,
  ) {
    const decision = this.policy.decisionFor(scope, capability);
    return (
      decision === CapabilityDecision.ALLOW ||
      (decision === CapabilityDecision.CONDITIONAL &&
        scope.organizationRole === MembershipRole.PSYCHOLOGIST)
    );
  }

  private async hasAssignment(patientId: string, scope: AppointmentScope) {
    const assignment = await this.prisma.patientAssignment.findFirst({
      where: {
        ...this.assignmentWhere(scope),
        patientId,
        patient: {
          organizationId: scope.organizationId,
          psychologistId: scope.userId,
        },
      },
      select: { id: true },
    });

    return Boolean(assignment);
  }

  private async requireAssignment(patientId: string, scope: AppointmentScope) {
    if (!(await this.hasAssignment(patientId, scope))) {
      throw new ForbiddenException('Clinical assignment is required');
    }
  }

  private assignmentWhere(
    scope: AppointmentScope,
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

  private requireAppointmentCapability(
    scope: AppointmentScope,
    capability: OrganizationCapability,
    operation: string,
    options: { allowReceptionistOperational?: boolean } = {},
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

    if (
      decision === CapabilityDecision.CONDITIONAL &&
      options.allowReceptionistOperational &&
      scope.organizationRole === MembershipRole.RECEPTIONIST
    ) {
      return;
    }

    this.observability.capabilityDenied(scope, capability, operation);
    throw new ForbiddenException('Organization capability is required');
  }

  private withoutServerFields<T extends object>(
    dto: T,
  ): Omit<T, 'organizationId'> {
    const appointmentData = { ...dto };
    Reflect.deleteProperty(appointmentData, 'organizationId');
    return appointmentData;
  }

  private appointmentNotFound() {
    return new NotFoundException('Appointment not found');
  }
}

function hasOwn<T extends object>(value: T, property: PropertyKey) {
  return Object.hasOwn(value, property);
}

function hasProvided<T extends object>(value: T, property: keyof T) {
  return hasOwn(value, property) && value[property] !== undefined;
}
