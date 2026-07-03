import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    createAppointmentDto: CreateAppointmentDto,
    user: AuthenticatedUser,
  ) {
    await this.getAccessiblePatientOrThrow(
      createAppointmentDto.patientId,
      user,
    );

    const psychologistId = this.isAdmin(user)
      ? createAppointmentDto.psychologistId
      : user.id;

    await this.ensureUserExists(psychologistId);

    return this.prisma.appointment.create({
      data: {
        ...createAppointmentDto,
        psychologistId,
      },
    });
  }

  findAll(user: AuthenticatedUser) {
    return this.prisma.appointment.findMany({
      where: this.isAdmin(user) ? undefined : { psychologistId: user.id },
      orderBy: {
        scheduledAt: 'desc',
      },
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const appointment = await this.getAccessibleAppointmentOrThrow(id, user);

    return appointment;
  }

  async findByPatientId(patientId: string, user: AuthenticatedUser) {
    await this.getAccessiblePatientOrThrow(patientId, user);

    return this.prisma.appointment.findMany({
      where: {
        patientId,
        ...(this.isAdmin(user) ? {} : { psychologistId: user.id }),
      },
      orderBy: {
        scheduledAt: 'desc',
      },
    });
  }

  async update(
    id: string,
    updateAppointmentDto: UpdateAppointmentDto,
    user: AuthenticatedUser,
  ) {
    await this.getAccessibleAppointmentOrThrow(id, user);

    if (updateAppointmentDto.patientId) {
      await this.getAccessiblePatientOrThrow(
        updateAppointmentDto.patientId,
        user,
      );
    }

    let psychologistId = updateAppointmentDto.psychologistId;

    if (!this.isAdmin(user)) {
      psychologistId = user.id;
    }

    if (psychologistId) {
      await this.ensureUserExists(psychologistId);
    }

    return this.prisma.appointment.update({
      where: { id },
      data: {
        ...updateAppointmentDto,
        ...(psychologistId ? { psychologistId } : {}),
      },
    });
  }

  async remove(id: string, user: AuthenticatedUser) {
    await this.getAccessibleAppointmentOrThrow(id, user);

    return this.prisma.appointment.delete({
      where: { id },
    });
  }

  private isAdmin(user: AuthenticatedUser) {
    return user.role === UserRole.ADMIN;
  }

  private async getAccessiblePatientOrThrow(
    patientId: string,
    user: AuthenticatedUser,
  ) {
    const patient = this.isAdmin(user)
      ? await this.prisma.patient.findUnique({ where: { id: patientId } })
      : await this.prisma.patient.findFirst({
          where: {
            id: patientId,
            psychologistId: user.id,
          },
        });

    if (!patient) {
      throw new NotFoundException(`Patient with id "${patientId}" not found`);
    }

    return patient;
  }

  private async getAccessibleAppointmentOrThrow(
    id: string,
    user: AuthenticatedUser,
  ) {
    const appointment = this.isAdmin(user)
      ? await this.prisma.appointment.findUnique({ where: { id } })
      : await this.prisma.appointment.findFirst({
          where: {
            id,
            psychologistId: user.id,
          },
        });

    if (!appointment) {
      throw new NotFoundException(`Appointment with id "${id}" not found`);
    }

    return appointment;
  }

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException(`User with id "${userId}" not found`);
    }
  }
}
