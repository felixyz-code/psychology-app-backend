import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentStatus,
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
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
import { AvailabilityQueryDto } from './dto/availability-query.dto';

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

    const startTime = new Date(createAppointmentDto.scheduledAt);
    const endTime = new Date(
      startTime.getTime() + createAppointmentDto.durationMinutes * 60 * 1000,
    );
    const conflict = await this.checkOverlap(
      createAppointmentDto.psychologistId,
      startTime,
      endTime,
      scope.organizationId ?? undefined,
    );
    if (conflict.hasConflict) {
      throw new BadRequestException(conflict.message);
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

    if (
      updateAppointmentDto.scheduledAt ||
      updateAppointmentDto.durationMinutes ||
      updateAppointmentDto.psychologistId
    ) {
      const targetPsychologistId =
        updateAppointmentDto.psychologistId ?? existingAppointment.psychologistId;
      const targetStartTime = updateAppointmentDto.scheduledAt
        ? new Date(updateAppointmentDto.scheduledAt)
        : new Date(existingAppointment.scheduledAt);
      const targetDuration =
        updateAppointmentDto.durationMinutes ??
        existingAppointment.durationMinutes;
      const targetEndTime = new Date(
        targetStartTime.getTime() + targetDuration * 60 * 1000,
      );

      const conflict = await this.checkOverlap(
        targetPsychologistId,
        targetStartTime,
        targetEndTime,
        scope.organizationId ?? undefined,
        existingAppointment.id,
      );
      if (conflict.hasConflict) {
        throw new BadRequestException(conflict.message);
      }
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

  async reschedule(
    id: string,
    rescheduleDto: RescheduleAppointmentDto,
    scope: AppointmentScope,
  ) {
    const existingAppointment = await this.getVisibleAppointmentOrThrow(
      id,
      scope,
    );
    this.requireAppointmentCapability(
      scope,
      OrganizationCapability.APPOINTMENT_MANAGE,
      'appointments.reschedule',
      { allowReceptionistOperational: true },
    );

    if (existingAppointment.status !== AppointmentStatus.SCHEDULED) {
      throw new BadRequestException(
        'La cita no se encuentra en un estado que permita su reprogramación.',
      );
    }

    const newStart = new Date(rescheduleDto.scheduledAt);
    if (isNaN(newStart.getTime())) {
      throw new BadRequestException('Formato de fecha u hora inválido.');
    }

    const durationMinutes =
      rescheduleDto.durationMinutes ?? existingAppointment.durationMinutes;
    const newEnd = new Date(newStart.getTime() + durationMinutes * 60 * 1000);

    const conflict = await this.checkOverlap(
      existingAppointment.psychologistId,
      newStart,
      newEnd,
      scope.organizationId ?? undefined,
      existingAppointment.id,
    );

    if (conflict.hasConflict) {
      throw new BadRequestException(conflict.message);
    }

    let notes = existingAppointment.notes;
    if (rescheduleDto.reason) {
      const reasonLine = `[Reprogramada: ${new Date().toISOString()} - Motivo: ${rescheduleDto.reason.trim()}]`;
      notes = notes ? `${notes}\n${reasonLine}` : reasonLine;
    }

    await this.prisma.appointment.updateMany({
      where: {
        id: existingAppointment.id,
        organizationId: scope.organizationId,
      },
      data: {
        scheduledAt: newStart,
        durationMinutes,
        notes,
      },
    });

    const appointment = await this.getVisibleAppointmentOrThrow(id, scope);
    return this.projectAppointment(
      appointment,
      await this.canReadNotes(appointment.patientId, scope),
    );
  }

  async getAvailability(
    query: AvailabilityQueryDto,
    scope: AppointmentScope,
  ) {
    this.requireAppointmentCapability(
      scope,
      OrganizationCapability.APPOINTMENT_READ,
      'appointments.availability',
    );

    const therapistId = query.therapistId;
    await this.ensureTenantProfessionalOrThrow(therapistId, scope);

    const dateStr = query.date; // "YYYY-MM-DD"
    const [yearStr, monthStr, dayStr] = dateStr.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1;
    const day = parseInt(dayStr, 10);

    const duration = query.durationMinutes || 60;
    const startHour = query.startHour ?? 8;
    const endHour = query.endHour ?? 20;

    if (startHour >= endHour) {
      throw new BadRequestException(
        'La hora inicial debe ser menor a la hora final.',
      );
    }

    const dayStart = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));

    const appointments = await this.prisma.appointment.findMany({
      where: {
        psychologistId: therapistId,
        organizationId: scope.organizationId ?? null,
        status: AppointmentStatus.SCHEDULED,
        scheduledAt: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
      select: {
        id: true,
        scheduledAt: true,
        durationMinutes: true,
      },
    });

    const scheduleBlocks = await this.prisma.scheduleBlock.findMany({
      where: {
        therapistId,
        organizationId: scope.organizationId,
        startTime: { lte: dayEnd },
        endTime: { gte: dayStart },
      },
      select: {
        id: true,
        title: true,
        startTime: true,
        endTime: true,
      },
    });

    const slots: {
      startTime: string;
      endTime: string;
      available: boolean;
      conflictType?: 'APPOINTMENT' | 'SCHEDULE_BLOCK';
      title?: string;
    }[] = [];

    const slotStartTotalMinutes = startHour * 60;
    const slotEndTotalMinutes = endHour * 60;

    for (
      let currentMinutes = slotStartTotalMinutes;
      currentMinutes + duration <= slotEndTotalMinutes;
      currentMinutes += duration
    ) {
      const slotHours = Math.floor(currentMinutes / 60);
      const slotMins = currentMinutes % 60;
      const endTotalMins = currentMinutes + duration;
      const endSlotHours = Math.floor(endTotalMins / 60);
      const endSlotMins = endTotalMins % 60;

      const slotStartTime = new Date(
        Date.UTC(year, month, day, slotHours, slotMins, 0, 0),
      );
      const slotEndTime = new Date(
        Date.UTC(year, month, day, endSlotHours, endSlotMins, 0, 0),
      );

      const slotStartMs = slotStartTime.getTime();
      const slotEndMs = slotEndTime.getTime();

      const apptConflict = appointments.find((appt) => {
        const aStart = new Date(appt.scheduledAt).getTime();
        const aEnd = aStart + appt.durationMinutes * 60 * 1000;
        return aStart < slotEndMs && aEnd > slotStartMs;
      });

      if (apptConflict) {
        slots.push({
          startTime: slotStartTime.toISOString(),
          endTime: slotEndTime.toISOString(),
          available: false,
          conflictType: 'APPOINTMENT',
        });
        continue;
      }

      const blockConflict = scheduleBlocks.find((block) => {
        const bStart = new Date(block.startTime).getTime();
        const bEnd = new Date(block.endTime).getTime();
        return bStart < slotEndMs && bEnd > slotStartMs;
      });

      if (blockConflict) {
        slots.push({
          startTime: slotStartTime.toISOString(),
          endTime: slotEndTime.toISOString(),
          available: false,
          conflictType: 'SCHEDULE_BLOCK',
          title: blockConflict.title,
        });
        continue;
      }

      slots.push({
        startTime: slotStartTime.toISOString(),
        endTime: slotEndTime.toISOString(),
        available: true,
      });
    }

    return {
      therapistId,
      date: dateStr,
      slotDurationMinutes: duration,
      slots,
    };
  }

  async checkOverlap(
    psychologistId: string,
    startTime: Date,
    endTime: Date,
    organizationId?: string,
    excludeAppointmentId?: string,
  ): Promise<{
    hasConflict: boolean;
    type?: 'APPOINTMENT' | 'SCHEDULE_BLOCK';
    message?: string;
    title?: string;
  }> {
    const windowStart = new Date(startTime.getTime() - 24 * 60 * 60 * 1000);
    const appointments = await this.prisma.appointment.findMany({
      where: {
        psychologistId,
        organizationId: organizationId ?? null,
        status: AppointmentStatus.SCHEDULED,
        scheduledAt: {
          gte: windowStart,
          lt: endTime,
        },
        ...(excludeAppointmentId
          ? { id: { not: excludeAppointmentId } }
          : {}),
      },
      select: {
        id: true,
        scheduledAt: true,
        durationMinutes: true,
      },
    });

    const startMs = startTime.getTime();
    const endMs = endTime.getTime();

    const conflictingAppt = appointments.find((appt) => {
      const apptStart = new Date(appt.scheduledAt).getTime();
      const apptEnd = apptStart + appt.durationMinutes * 60 * 1000;
      return apptStart < endMs && apptEnd > startMs;
    });

    if (conflictingAppt) {
      return {
        hasConflict: true,
        type: 'APPOINTMENT',
        message: 'Existe un conflicto de horario con otra cita ya programada.',
      };
    }

    const block = await this.prisma.scheduleBlock.findFirst({
      where: {
        organizationId: organizationId ?? undefined,
        therapistId: psychologistId,
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });

    if (block) {
      return {
        hasConflict: true,
        type: 'SCHEDULE_BLOCK',
        message:
          'El horario seleccionado coincide con un bloqueo de agenda del terapeuta.',
        title: block.title,
      };
    }

    return { hasConflict: false };
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
