import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCaseFileDto } from './dto/create-case-file.dto';
import { UpdateCaseFileDto } from './dto/update-case-file.dto';

@Injectable()
export class CaseFilesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createCaseFileDto: CreateCaseFileDto) {
    await this.ensurePatientExists(createCaseFileDto.patientId);

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

  findAll() {
    return this.prisma.caseFile.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const caseFile = await this.prisma.caseFile.findUnique({
      where: { id },
    });

    if (!caseFile) {
      throw new NotFoundException(`Case file with id "${id}" not found`);
    }

    return caseFile;
  }

  async findByPatientId(patientId: string) {
    await this.ensurePatientExists(patientId);

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

  async update(id: string, updateCaseFileDto: UpdateCaseFileDto) {
    await this.findOne(id);

    return this.prisma.caseFile.update({
      where: { id },
      data: updateCaseFileDto,
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
}
