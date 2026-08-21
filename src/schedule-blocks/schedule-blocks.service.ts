import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppointmentStatus, MembershipRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CapabilityDecision,
  OrganizationCapability,
} from '../tenant-context/authorization/organization-capability';
import { OrganizationPolicyService } from '../tenant-context/authorization/organization-policy.service';
import type { ClinicalAccessScope } from '../tenant-context/clinical-access.types';
import { TenantObservabilityService } from '../tenant-context/tenant-observability.service';
import { CreateScheduleBlockDto } from './dto/create-schedule-block.dto';
import { QueryScheduleBlocksDto } from './dto/query-schedule-blocks.dto';

type ScheduleBlockScope = ClinicalAccessScope;

@Injectable()
export class ScheduleBlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: OrganizationPolicyService,
    private readonly observability: TenantObservabilityService,
  ) {}

  async create(dto: CreateScheduleBlockDto, scope: ScheduleBlockScope) {
    this.requireScheduleCapability(
      scope,
      OrganizationCapability.APPOINTMENT_MANAGE,
      'schedule_blocks.create',
      { allowReceptionistOperational: true },
    );

    const therapistId = dto.therapistId || scope.userId;
    this.requireTherapistScopeForTarget(therapistId, scope);
    await this.ensureTenantProfessionalOrThrow(therapistId, scope);

    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);

    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      throw new BadRequestException('Formato de fecha u hora inválido.');
    }

    if (startTime.getTime() >= endTime.getTime()) {
      throw new BadRequestException(
        'La hora de término debe ser posterior a la hora de inicio.',
      );
    }

    // Check overlap with other schedule blocks for the same therapist
    const existingBlock = await this.prisma.scheduleBlock.findFirst({
      where: {
        organizationId: scope.organizationId,
        therapistId,
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });

    if (existingBlock) {
      throw new BadRequestException(
        `El horario seleccionado coincide con un bloqueo de agenda del terapeuta: "${existingBlock.title}".`,
      );
    }

    // Check overlap with active appointments
    const overlappingAppointment = await this.findOverlappingAppointment(
      therapistId,
      startTime,
      endTime,
      scope.organizationId ?? undefined,
    );

    if (overlappingAppointment) {
      throw new BadRequestException(
        'Existe un conflicto de horario con otra cita ya programada.',
      );
    }

    return this.prisma.scheduleBlock.create({
      data: {
        organizationId: scope.organizationId,
        therapistId,
        title: dto.title.trim(),
        reason: dto.reason?.trim() || null,
        startTime,
        endTime,
      },
    });
  }

  async findAll(query: QueryScheduleBlocksDto, scope: ScheduleBlockScope) {
    this.requireScheduleCapability(
      scope,
      OrganizationCapability.APPOINTMENT_READ,
      'schedule_blocks.find_all',
    );

    let therapistId = query.therapistId;
    if (scope.organizationRole === MembershipRole.PSYCHOLOGIST) {
      therapistId = scope.userId;
    }

    const where: any = {
      organizationId: scope.organizationId,
    };

    if (therapistId) {
      where.therapistId = therapistId;
    }

    if (query.startDate || query.endDate) {
      where.AND = [];
      if (query.startDate) {
        where.AND.push({ endTime: { gte: new Date(query.startDate) } });
      }
      if (query.endDate) {
        where.AND.push({ startTime: { lte: new Date(query.endDate) } });
      }
    }

    return this.prisma.scheduleBlock.findMany({
      where,
      orderBy: {
        startTime: 'asc',
      },
    });
  }

  async findOne(id: string, scope: ScheduleBlockScope) {
    this.requireScheduleCapability(
      scope,
      OrganizationCapability.APPOINTMENT_READ,
      'schedule_blocks.find_one',
    );

    const block = await this.prisma.scheduleBlock.findFirst({
      where: {
        id,
        organizationId: scope.organizationId,
        ...(scope.organizationRole === MembershipRole.PSYCHOLOGIST
          ? { therapistId: scope.userId }
          : {}),
      },
    });

    if (!block) {
      throw new NotFoundException('Bloqueo de horario no encontrado.');
    }

    return block;
  }

  async remove(id: string, scope: ScheduleBlockScope) {
    this.requireScheduleCapability(
      scope,
      OrganizationCapability.APPOINTMENT_MANAGE,
      'schedule_blocks.remove',
      { allowReceptionistOperational: true },
    );

    const block = await this.findOne(id, scope);

    await this.prisma.scheduleBlock.delete({
      where: {
        id: block.id,
      },
    });

    return block;
  }

  private async findOverlappingAppointment(
    psychologistId: string,
    startTime: Date,
    endTime: Date,
    organizationId?: string,
    excludeAppointmentId?: string,
  ) {
    // Search window: appointments scheduled within 24 hours prior to startTime up to endTime
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
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      },
      select: {
        id: true,
        scheduledAt: true,
        durationMinutes: true,
      },
    });

    const blockStart = startTime.getTime();
    const blockEnd = endTime.getTime();

    return appointments.find((appt) => {
      const apptStart = new Date(appt.scheduledAt).getTime();
      const apptEnd = apptStart + appt.durationMinutes * 60 * 1000;
      return apptStart < blockEnd && apptEnd > blockStart;
    });
  }

  private async ensureTenantProfessionalOrThrow(
    userId: string,
    scope: ScheduleBlockScope,
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
      throw new NotFoundException('Therapist not found in active organization');
    }
  }

  private requireTherapistScopeForTarget(
    therapistId: string,
    scope: ScheduleBlockScope,
  ) {
    if (
      scope.organizationRole === MembershipRole.PSYCHOLOGIST &&
      therapistId !== scope.userId
    ) {
      throw new ForbiddenException('Appointment capability is required');
    }
  }

  private requireScheduleCapability(
    scope: ScheduleBlockScope,
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
}
