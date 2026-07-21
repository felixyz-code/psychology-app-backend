import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DocumentsService } from '../documents/documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PatientAccessScope } from './types/patient-access-scope.type';

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentsService: DocumentsService,
  ) {}

  create(createPatientDto: CreatePatientDto, scope: PatientAccessScope) {
    return this.prisma.patient.create({
      data: {
        ...this.withoutOwnership(createPatientDto),
        organizationId: scope.organizationId,
        psychologistId: scope.psychologistId,
      },
    });
  }

  findAll(scope: PatientAccessScope) {
    return this.prisma.patient.findMany({
      where: this.scopeWhere(scope),
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, scope: PatientAccessScope) {
    return this.findScopedPatientOrThrow(id, scope);
  }

  async update(
    id: string,
    updatePatientDto: UpdatePatientDto,
    scope: PatientAccessScope,
  ) {
    const result = await this.prisma.patient.updateMany({
      where: { id, ...this.scopeWhere(scope) },
      data: this.withoutOwnership(updatePatientDto),
    });

    if (result.count !== 1) {
      throw this.patientNotFound(id);
    }

    // updateMany atomically applies the full ownership predicate before reread.
    return this.findScopedPatientOrThrow(id, scope);
  }

  async remove(id: string, scope: PatientAccessScope) {
    const patient = await this.findScopedPatientOrThrow(id, scope);
    const documents = await this.prisma.document.findMany({
      where: {
        caseFile: {
          patient: { id, ...this.scopeWhere(scope) },
        },
      },
      select: { filePath: true },
    });

    const result = await this.prisma.patient.deleteMany({
      where: { id, ...this.scopeWhere(scope) },
    });

    if (result.count !== 1) {
      throw this.patientNotFound(id);
    }

    await this.documentsService.cleanupDocumentFiles(
      documents.map((document) => document.filePath),
    );

    return patient;
  }

  private scopeWhere(scope: PatientAccessScope): Prisma.PatientWhereInput {
    return {
      organizationId: scope.organizationId,
      psychologistId: scope.psychologistId,
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

  private async findScopedPatientOrThrow(
    id: string,
    scope: PatientAccessScope,
  ) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, ...this.scopeWhere(scope) },
    });

    if (!patient) {
      throw this.patientNotFound(id);
    }

    return patient;
  }

  private patientNotFound(id: string) {
    return new NotFoundException(`Patient with id "${id}" not found`);
  }
}
