import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { TeleconsultationRoomStatus, MembershipRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ClinicalAccessScope } from '../tenant-context/clinical-access.types';

type TeleconsultationScope = ClinicalAccessScope;

/** Generates a cryptographically secure 16-char hex room code. */
function generateRoomCode(): string {
  return randomBytes(8).toString('hex');
}

/** Generates a 6-digit numeric therapist passcode. */
function generateTherapistPasscode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Generates an opaque UUID v4 patient token. */
function generatePatientToken(): string {
  return randomUUID();
}

@Injectable()
export class TeleconsultationService {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────
  // CREATE ROOM
  // ─────────────────────────────────────────────

  async createRoom(appointmentId: string, scope: TeleconsultationScope) {
    const appointment = await this.getAppointmentOrThrow(appointmentId, scope);

    this.requireTherapistOwnership(appointment.psychologistId, scope);

    const existing = await this.prisma.teleconsultationRoom.findUnique({
      where: { appointmentId },
    });
    if (
      existing &&
      existing.status !== TeleconsultationRoomStatus.TERMINATED &&
      existing.status !== TeleconsultationRoomStatus.EXPIRED
    ) {
      throw new ConflictException(
        'An active teleconsultation room already exists for this appointment. Terminate it before creating a new one.',
      );
    }

    // expiresAt = scheduledAt + durationMinutes + 60 min safety buffer
    const scheduledAt = new Date(appointment.scheduledAt);
    const expiresAt = new Date(
      scheduledAt.getTime() +
        (appointment.durationMinutes + 60) * 60 * 1000,
    );

    if (existing) {
      const room = await this.prisma.teleconsultationRoom.update({
        where: { id: existing.id },
        data: {
          organizationId: scope.organizationId ?? null,
          roomCode: generateRoomCode(),
          provider: 'internal',
          therapistPasscode: generateTherapistPasscode(),
          patientToken: generatePatientToken(),
          expiresAt,
          status: TeleconsultationRoomStatus.PENDING,
        },
      });
      return this.formatRoom(room);
    }

    const room = await this.prisma.teleconsultationRoom.create({
      data: {
        appointmentId,
        organizationId: scope.organizationId ?? null,
        roomCode: generateRoomCode(),
        provider: 'internal',
        therapistPasscode: generateTherapistPasscode(),
        patientToken: generatePatientToken(),
        expiresAt,
        status: TeleconsultationRoomStatus.PENDING,
      },
    });

    return this.formatRoom(room);
  }

  // ─────────────────────────────────────────────
  // GET ROOM
  // ─────────────────────────────────────────────

  async getRoom(appointmentId: string, scope: TeleconsultationScope) {
    await this.getAppointmentOrThrow(appointmentId, scope);
    this.requireTenantMembership(scope);

    const room = await this.prisma.teleconsultationRoom.findUnique({
      where: { appointmentId },
    });
    if (!room) {
      throw new NotFoundException('No teleconsultation room found for this appointment.');
    }
    this.requireTenantRoom(room.organizationId, scope);

    return this.formatRoom(room);
  }

  // ─────────────────────────────────────────────
  // ACTIVATE ROOM
  // ─────────────────────────────────────────────

  async activateRoom(appointmentId: string, scope: TeleconsultationScope) {
    const appointment = await this.getAppointmentOrThrow(appointmentId, scope);
    this.requireTherapistOwnership(appointment.psychologistId, scope);

    const room = await this.prisma.teleconsultationRoom.findUnique({
      where: { appointmentId },
    });
    if (!room) {
      throw new NotFoundException('No teleconsultation room found for this appointment.');
    }
    this.requireTenantRoom(room.organizationId, scope);

    if (room.status === TeleconsultationRoomStatus.ACTIVE) {
      throw new BadRequestException('Room is already active.');
    }
    if (room.status === TeleconsultationRoomStatus.TERMINATED) {
      throw new BadRequestException(
        `Cannot activate a room with status ${room.status}.`,
      );
    }

    const isExpired =
      room.status === TeleconsultationRoomStatus.EXPIRED ||
      new Date() > room.expiresAt;

    const expiresAt = isExpired
      ? new Date(Date.now() + 60 * 60 * 1000)
      : room.expiresAt;

    const updated = await this.prisma.teleconsultationRoom.update({
      where: { id: room.id },
      data: {
        status: TeleconsultationRoomStatus.ACTIVE,
        expiresAt,
      },
    });
    return this.formatRoom(updated);
  }

  // ─────────────────────────────────────────────
  // TERMINATE ROOM
  // ─────────────────────────────────────────────

  async terminateRoom(appointmentId: string, scope: TeleconsultationScope) {
    const appointment = await this.getAppointmentOrThrow(appointmentId, scope);
    this.requireTherapistOwnership(appointment.psychologistId, scope);

    const room = await this.prisma.teleconsultationRoom.findUnique({
      where: { appointmentId },
    });
    if (!room) {
      throw new NotFoundException('No teleconsultation room found for this appointment.');
    }
    this.requireTenantRoom(room.organizationId, scope);

    if (room.status === TeleconsultationRoomStatus.TERMINATED) {
      throw new BadRequestException('Room is already terminated.');
    }

    const updated = await this.prisma.teleconsultationRoom.update({
      where: { id: room.id },
      data: { status: TeleconsultationRoomStatus.TERMINATED },
    });
    return this.formatRoom(updated);
  }

  // ─────────────────────────────────────────────
  // PUBLIC PATIENT ACCESS
  // ─────────────────────────────────────────────

  async getRoomAccess(roomCode: string, token: string) {
    if (!token || !token.trim()) {
      throw new UnauthorizedException('Missing or invalid patient token.');
    }

    const room = await this.prisma.teleconsultationRoom.findUnique({
      where: { roomCode },
      include: {
        appointment: {
          include: {
            patient: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
            psychologist: {
              select: {
                name: true,
              },
            },
            organization: {
              select: {
                displayName: true,
                tradeName: true,
              },
            },
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('Teleconsultation room not found.');
    }

    if (room.patientToken !== token.trim()) {
      throw new UnauthorizedException('Invalid patient token.');
    }

    const isExpired =
      room.status === TeleconsultationRoomStatus.EXPIRED ||
      new Date() > room.expiresAt;

    const currentStatus =
      room.status === TeleconsultationRoomStatus.TERMINATED
        ? TeleconsultationRoomStatus.TERMINATED
        : isExpired
          ? TeleconsultationRoomStatus.EXPIRED
          : room.status;

    const patientFullName = room.appointment?.patient
      ? `${room.appointment.patient.firstName} ${room.appointment.patient.lastName}`.trim()
      : 'Paciente';

    const psychologistFullName =
      room.appointment?.psychologist?.name || 'Profesional de la salud';

    const organizationDisplayName =
      room.appointment?.organization?.displayName ||
      room.appointment?.organization?.tradeName ||
      'PsiqueOS';

    return {
      id: room.id,
      roomCode: room.roomCode,
      provider: room.provider,
      status: currentStatus,
      expiresAt: room.expiresAt.toISOString(),
      scheduledAt: room.appointment.scheduledAt.toISOString(),
      durationMinutes: room.appointment.durationMinutes,
      organizationName: organizationDisplayName,
      psychologistName: psychologistFullName,
      patientName: patientFullName,
    };
  }

  buildTeleconsultationUrl(
    frontendBaseUrl: string,
    roomCode: string,
    patientToken: string,
  ): string {
    const base = frontendBaseUrl.replace(/\/+$/, '');
    return `${base}/teleconsulta/${roomCode}?token=${patientToken}`;
  }

  // ─────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────

  private async getAppointmentOrThrow(
    appointmentId: string,
    scope: TeleconsultationScope,
  ) {
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        ...(scope.organizationId
          ? { organizationId: scope.organizationId }
          : { psychologistId: scope.userId }),
      },
    });
    if (!appointment) {
      throw new NotFoundException(
        `Appointment ${appointmentId} not found within this tenant scope.`,
      );
    }
    return appointment;
  }

  private requireTherapistOwnership(
    appointmentPsychologistId: string,
    scope: TeleconsultationScope,
  ) {
    const isOwner = scope.userId === appointmentPsychologistId;
    const isAdmin =
      scope.organizationRole === MembershipRole.OWNER ||
      scope.organizationRole === MembershipRole.ADMIN;

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'Only the assigned therapist or an org admin can manage this teleconsultation room.',
      );
    }
  }

  private requireTenantMembership(scope: TeleconsultationScope) {
    if (!scope.organizationId && !scope.userId) {
      throw new ForbiddenException('No valid tenant context.');
    }
  }

  private requireTenantRoom(
    roomOrgId: string | null,
    scope: TeleconsultationScope,
  ) {
    if (scope.organizationId && roomOrgId && roomOrgId !== scope.organizationId) {
      throw new ForbiddenException(
        'This teleconsultation room does not belong to your organization.',
      );
    }
  }

  private formatRoom(room: {
    id: string;
    appointmentId: string;
    organizationId: string | null;
    roomCode: string;
    provider: string;
    therapistPasscode: string;
    patientToken: string;
    expiresAt: Date;
    status: TeleconsultationRoomStatus;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: room.id,
      appointmentId: room.appointmentId,
      organizationId: room.organizationId,
      roomCode: room.roomCode,
      provider: room.provider,
      therapistPasscode: room.therapistPasscode,
      patientToken: room.patientToken,
      expiresAt: room.expiresAt.toISOString(),
      status: room.status,
      createdAt: room.createdAt.toISOString(),
      updatedAt: room.updatedAt.toISOString(),
    };
  }
}
