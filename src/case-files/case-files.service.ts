import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCaseFileDto } from './dto/create-case-file.dto';
import { UpdateCaseFileDto } from './dto/update-case-file.dto';

@Injectable()
export class CaseFilesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createCaseFileDto: CreateCaseFileDto, user: AuthenticatedUser) {
    await this.getAccessiblePatientOrThrow(createCaseFileDto.patientId, user);

    const existingCaseFile = await this.prisma.caseFile.findUnique({
      where: { patientId: createCaseFileDto.patientId },
    });

    if (existingCaseFile) {
      throw new ConflictException(
        `Patient with id "${createCaseFileDto.patientId}" already has a case file`,
      );
    }

    return this.prisma.caseFile.create({
      data: createCaseFileDto,
    });
  }

  findAll(user: AuthenticatedUser) {
    return this.prisma.caseFile.findMany({
      where: this.isAdmin(user)
        ? undefined
        : {
            patient: {
              psychologistId: user.id,
            },
          },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const caseFile = await this.getAccessibleCaseFileOrThrow(id, user);

    return caseFile;
  }

  async findByPatientId(patientId: string, user: AuthenticatedUser) {
    await this.getAccessiblePatientOrThrow(patientId, user);

    const caseFile = await this.prisma.caseFile.findUnique({
      where: { patientId },
    });

    if (!caseFile) {
      throw new NotFoundException(
        `Case file for patient with id "${patientId}" not found`,
      );
    }

    return caseFile;
  }

  async update(
    id: string,
    updateCaseFileDto: UpdateCaseFileDto,
    user: AuthenticatedUser,
  ) {
    await this.getAccessibleCaseFileOrThrow(id, user);

    return this.prisma.caseFile.update({
      where: { id },
      data: updateCaseFileDto,
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

  private async getAccessibleCaseFileOrThrow(
    id: string,
    user: AuthenticatedUser,
  ) {
    const caseFile = this.isAdmin(user)
      ? await this.prisma.caseFile.findUnique({ where: { id } })
      : await this.prisma.caseFile.findFirst({
          where: {
            id,
            patient: {
              psychologistId: user.id,
            },
          },
        });

    if (!caseFile) {
      throw new NotFoundException(`Case file with id "${id}" not found`);
    }

    return caseFile;
  }
}
