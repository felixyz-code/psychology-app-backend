import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createDocumentDto: CreateDocumentDto) {
    await this.ensureCaseFileExists(createDocumentDto.caseFileId);
    await this.ensureUserExists(createDocumentDto.uploadedById);

    return this.prisma.document.create({
      data: createDocumentDto,
    });
  }

  findAll() {
    return this.prisma.document.findMany({
      orderBy: {
        uploadedAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
    });

    if (!document) {
      throw new NotFoundException(`Document with id "${id}" not found`);
    }

    return document;
  }

  async findByCaseFileId(caseFileId: string) {
    await this.ensureCaseFileExists(caseFileId);

    return this.prisma.document.findMany({
      where: { caseFileId },
      orderBy: {
        uploadedAt: 'desc',
      },
    });
  }

  async update(id: string, updateDocumentDto: UpdateDocumentDto) {
    await this.findOne(id);

    return this.prisma.document.update({
      where: { id },
      data: updateDocumentDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.document.delete({
      where: { id },
    });
  }

  private async ensureCaseFileExists(caseFileId: string) {
    const caseFile = await this.prisma.caseFile.findUnique({
      where: { id: caseFileId },
    });

    if (!caseFile) {
      throw new NotFoundException(`Case file with id "${caseFileId}" not found`);
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
