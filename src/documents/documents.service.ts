import { randomUUID } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';

const allowedInlineMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

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

  async upload(uploadDocumentDto: UploadDocumentDto, file: Express.Multer.File) {
    const caseFile = await this.ensureCaseFileExists(uploadDocumentDto.caseFileId);
    await this.ensureUserExists(uploadDocumentDto.uploadedById);

    const extension = extname(file.originalname).toLowerCase();
    const safeFileName = `${randomUUID()}${extension}`;
    const uploadRoot = process.env.UPLOADS_PATH ?? 'uploads';
    const absoluteUploadRoot = isAbsolute(uploadRoot)
      ? uploadRoot
      : join(process.cwd(), uploadRoot);
    const patientDirectory = join(
      absoluteUploadRoot,
      'patients',
      caseFile.patientId,
    );
    const absoluteFilePath = join(patientDirectory, safeFileName);

    await mkdir(patientDirectory, { recursive: true });
    await writeFile(absoluteFilePath, file.buffer);

    return this.prisma.document.create({
      data: {
        caseFileId: uploadDocumentDto.caseFileId,
        uploadedById: uploadDocumentDto.uploadedById,
        fileName: file.originalname,
        filePath: this.toRelativePath(absoluteFilePath),
        mimeType: file.mimetype,
      },
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
    return this.getDocumentOrThrow(id);
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

  async getDownloadFile(id: string) {
    const document = await this.getDocumentOrThrow(id);
    const absoluteFilePath = await this.resolveDocumentFilePath(document.filePath);

    return {
      document,
      absoluteFilePath,
      mimeType: document.mimeType ?? 'application/octet-stream',
    };
  }

  async getViewFile(id: string) {
    const document = await this.getDocumentOrThrow(id);
    const absoluteFilePath = await this.resolveDocumentFilePath(document.filePath);

    if (!document.mimeType || !allowedInlineMimeTypes.has(document.mimeType)) {
      throw new BadRequestException(
        'Only PDF, JPG, JPEG and PNG documents can be viewed inline',
      );
    }

    return {
      document,
      absoluteFilePath,
      mimeType: document.mimeType,
    };
  }

  private async ensureCaseFileExists(caseFileId: string) {
    const caseFile = await this.prisma.caseFile.findUnique({
      where: { id: caseFileId },
    });

    if (!caseFile) {
      throw new NotFoundException(`Case file with id "${caseFileId}" not found`);
    }

    return caseFile;
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

  private toRelativePath(absoluteFilePath: string) {
    return relative(process.cwd(), absoluteFilePath).split(sep).join('/');
  }

  private async getDocumentOrThrow(id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
    });

    if (!document) {
      throw new NotFoundException(`Document with id "${id}" not found`);
    }

    return document;
  }

  private getUploadsRoot() {
    const uploadRoot = process.env.UPLOADS_PATH ?? 'uploads';

    return isAbsolute(uploadRoot)
      ? resolve(uploadRoot)
      : resolve(process.cwd(), uploadRoot);
  }

  private async resolveDocumentFilePath(filePath: string) {
    const uploadsRoot = this.getUploadsRoot();
    const candidatePath = isAbsolute(filePath)
      ? resolve(filePath)
      : resolve(process.cwd(), filePath);
    const relativeToUploadsRoot = relative(uploadsRoot, candidatePath);

    if (
      relativeToUploadsRoot.startsWith('..') ||
      isAbsolute(relativeToUploadsRoot)
    ) {
      throw new NotFoundException('Document file not found');
    }

    try {
      await access(candidatePath);
    } catch {
      throw new NotFoundException('Document file not found');
    }

    return candidatePath;
  }
}
