import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

@Injectable()
export class AppointmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createAppointmentDto: CreateAppointmentDto) {
    await this.ensurePatientExists(createAppointmentDto.patientId);
    await this.ensureUserExists(createAppointmentDto.psychologistId);

    return this.prisma.appointment.create({
      data: createAppointmentDto,
    });
  }

  findAll() {
    return this.prisma.appointment.findMany({
      orderBy: {
        scheduledAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
    });

    if (!appointment) {
      throw new NotFoundException(`Appointment with id "${id}" not found`);
    }

    return appointment;
  }

  async findByPatientId(patientId: string) {
    await this.ensurePatientExists(patientId);

    return this.prisma.appointment.findMany({
      where: { patientId },
      orderBy: {
        scheduledAt: 'desc',
      },
    });
  }

  async update(id: string, updateAppointmentDto: UpdateAppointmentDto) {
    await this.findOne(id);

    if (updateAppointmentDto.patientId) {
      await this.ensurePatientExists(updateAppointmentDto.patientId);
    }

    if (updateAppointmentDto.psychologistId) {
      await this.ensureUserExists(updateAppointmentDto.psychologistId);
    }

    return this.prisma.appointment.update({
      where: { id },
      data: updateAppointmentDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.appointment.delete({
      where: { id },
    });
  }

  private async ensurePatientExists(patientId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
    });

    if (!patient) {
      throw new NotFoundException(`Patient with id "${patientId}" not found`);
    }
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
