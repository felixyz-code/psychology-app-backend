import { randomUUID } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AppConfigService } from '../config/configuration';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async create(createDocumentDto: CreateDocumentDto, user: AuthenticatedUser) {
    await this.getAccessibleCaseFileOrThrow(createDocumentDto.caseFileId, user);

    const uploadedById = this.isAdmin(user)
      ? createDocumentDto.uploadedById
      : user.id;

    if (this.isAdmin(user)) {
      await this.ensureUserExists(uploadedById);
    }

    return this.prisma.document.create({
      data: {
        ...createDocumentDto,
        uploadedById,
      },
    });
  }

  async upload(
    uploadDocumentDto: UploadDocumentDto,
    file: Express.Multer.File,
    user: AuthenticatedUser,
  ) {
    const caseFile = await this.getAccessibleCaseFileOrThrow(
      uploadDocumentDto.caseFileId,
      user,
    );

    const uploadedById = user.id;

    const extension = extname(file.originalname).toLowerCase();
    const safeFileName = `${randomUUID()}${extension}`;
    const uploadRoot = this.config.uploadsPath;
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
        uploadedById,
        fileName: file.originalname,
        filePath: this.toRelativePath(absoluteFilePath),
        mimeType: file.mimetype,
      },
    });
  }

  findAll(user: AuthenticatedUser) {
    return this.prisma.document.findMany({
      where: this.isAdmin(user)
        ? undefined
        : {
            caseFile: {
              patient: {
                psychologistId: user.id,
              },
            },
          },
      orderBy: {
        uploadedAt: 'desc',
      },
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    return this.getDocumentOrThrow(id, user);
  }

  async findByCaseFileId(caseFileId: string, user: AuthenticatedUser) {
    await this.getAccessibleCaseFileOrThrow(caseFileId, user);

    return this.prisma.document.findMany({
      where: { caseFileId },
      orderBy: {
        uploadedAt: 'desc',
      },
    });
  }

  async update(
    id: string,
    updateDocumentDto: UpdateDocumentDto,
    user: AuthenticatedUser,
  ) {
    await this.findOne(id, user);

    return this.prisma.document.update({
      where: { id },
      data: updateDocumentDto,
    });
  }

  async remove(id: string, user: AuthenticatedUser) {
    await this.findOne(id, user);

    return this.prisma.document.delete({
      where: { id },
    });
  }

  async getDownloadFile(id: string, user: AuthenticatedUser) {
    const document = await this.getDocumentOrThrow(id, user);
    const absoluteFilePath = await this.resolveDocumentFilePath(
      document.filePath,
    );

    return {
      document,
      absoluteFilePath,
      mimeType: document.mimeType ?? 'application/octet-stream',
    };
  }

  async getViewFile(id: string, user: AuthenticatedUser) {
    const document = await this.getDocumentOrThrow(id, user);
    const absoluteFilePath = await this.resolveDocumentFilePath(
      document.filePath,
    );

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

  private isAdmin(user: AuthenticatedUser) {
    return user.role === UserRole.ADMIN;
  }

  private async getAccessibleCaseFileOrThrow(
    caseFileId: string,
    user: AuthenticatedUser,
  ) {
    const caseFile = this.isAdmin(user)
      ? await this.prisma.caseFile.findUnique({ where: { id: caseFileId } })
      : await this.prisma.caseFile.findFirst({
          where: {
            id: caseFileId,
            patient: {
              psychologistId: user.id,
            },
          },
        });

    if (!caseFile) {
      throw new NotFoundException(
        `Case file with id "${caseFileId}" not found`,
      );
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

  private async getDocumentOrThrow(id: string, user: AuthenticatedUser) {
    const document = this.isAdmin(user)
      ? await this.prisma.document.findUnique({ where: { id } })
      : await this.prisma.document.findFirst({
          where: {
            id,
            caseFile: {
              patient: {
                psychologistId: user.id,
              },
            },
          },
        });

    if (!document) {
      throw new NotFoundException(`Document with id "${id}" not found`);
    }

    return document;
  }

  private getUploadsRoot() {
    const uploadRoot = this.config.uploadsPath;

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
