import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { DocumentsService } from '../documents/documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentsService: DocumentsService,
  ) {}

  async create(createPatientDto: CreatePatientDto, user: AuthenticatedUser) {
    const psychologistId = this.isAdmin(user)
      ? createPatientDto.psychologistId
      : user.id;

    await this.ensurePsychologistExists(psychologistId);

    return this.prisma.patient.create({
      data: {
        ...createPatientDto,
        psychologistId,
      },
    });
  }

  findAll(user: AuthenticatedUser) {
    return this.prisma.patient.findMany({
      where: this.isAdmin(user) ? undefined : { psychologistId: user.id },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const patient = this.isAdmin(user)
      ? await this.prisma.patient.findUnique({ where: { id } })
      : await this.prisma.patient.findFirst({
          where: {
            id,
            psychologistId: user.id,
          },
        });

    if (!patient) {
      throw new NotFoundException(`Patient with id "${id}" not found`);
    }

    return patient;
  }

  async update(
    id: string,
    updatePatientDto: UpdatePatientDto,
    user: AuthenticatedUser,
  ) {
    await this.findOne(id, user);

    let psychologistId = updatePatientDto.psychologistId;

    if (!this.isAdmin(user)) {
      psychologistId = user.id;
    }

    if (psychologistId) {
      await this.ensurePsychologistExists(psychologistId);
    }

    return this.prisma.patient.update({
      where: { id },
      data: {
        ...updatePatientDto,
        ...(psychologistId ? { psychologistId } : {}),
      },
    });
  }

  async remove(id: string, user: AuthenticatedUser) {
    await this.findOne(id, user);
    const documents = await this.prisma.document.findMany({
      where: {
        caseFile: {
          patientId: id,
        },
      },
      select: { filePath: true },
    });

    const deletedPatient = await this.prisma.patient.delete({
      where: { id },
    });

    await this.documentsService.cleanupDocumentFiles(
      documents.map((document) => document.filePath),
    );

    return deletedPatient;
  }

  private isAdmin(user: AuthenticatedUser) {
    return user.role === UserRole.ADMIN;
  }

  private async ensurePsychologistExists(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException(`User with id "${userId}" not found`);
    }
  }
}
