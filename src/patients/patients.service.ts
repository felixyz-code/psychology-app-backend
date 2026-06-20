import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  create(createPatientDto: CreatePatientDto) {
    return this.prisma.patient.create({
      data: createPatientDto,
    });
  }

  findAll() {
    return this.prisma.patient.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { id },
    });

    if (!patient) {
      throw new NotFoundException(`Patient with id "${id}" not found`);
    }

    return patient;
  }

  async update(id: string, updatePatientDto: UpdatePatientDto) {
    await this.findOne(id);

    return this.prisma.patient.update({
      where: { id },
      data: updatePatientDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.patient.delete({
      where: { id },
    });
  }
}
