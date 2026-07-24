import { randomUUID } from 'node:crypto';
import { access, mkdir, realpath, unlink, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppConfigService } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { ClinicalAccessPolicyService } from '../tenant-context/clinical-access-policy.service';
import type { ClinicalAccessScope } from '../tenant-context/clinical-access.types';
import { OrganizationCapability } from '../tenant-context/authorization/organization-capability';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { validateDocumentFileContent } from './document-file.validation';

const allowedInlineMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly clinicalPolicy: ClinicalAccessPolicyService,
  ) {}

  async create(
    createDocumentDto: CreateDocumentDto,
    scope: ClinicalAccessScope,
  ) {
    const caseFile = await this.getVisibleCaseFileOrThrow(
      createDocumentDto.caseFileId,
      scope,
    );
    this.clinicalPolicy.requireCapability(
      scope,
      OrganizationCapability.DOCUMENT_UPLOAD,
      'documents.create',
    );
    await this.requireAssignment(caseFile.patientId, scope);
    this.assertSafeStoredDocumentPath(
      createDocumentDto.filePath,
      caseFile.patientId,
    );

    return this.prisma.document.create({
      data: {
        ...this.withoutServerFields(createDocumentDto),
        organizationId: scope.organizationId,
        uploadedById: scope.userId,
      },
    });
  }

  async upload(
    uploadDocumentDto: UploadDocumentDto,
    file: Express.Multer.File,
    scope: ClinicalAccessScope,
  ) {
    const caseFile = await this.getVisibleCaseFileOrThrow(
      uploadDocumentDto.caseFileId,
      scope,
    );
    this.clinicalPolicy.requireCapability(
      scope,
      OrganizationCapability.DOCUMENT_UPLOAD,
      'documents.upload',
    );
    await this.requireAssignment(caseFile.patientId, scope);
    validateDocumentFileContent(file);

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
    const storedFilePath = this.toStoredPath(
      absoluteUploadRoot,
      absoluteFilePath,
    );

    await mkdir(patientDirectory, { recursive: true });
    await writeFile(absoluteFilePath, file.buffer, { flag: 'wx' });

    try {
      return await this.prisma.document.create({
        data: {
          caseFileId: uploadDocumentDto.caseFileId,
          organizationId: scope.organizationId,
          uploadedById: scope.userId,
          fileName: file.originalname,
          filePath: storedFilePath,
          mimeType: file.mimetype,
        },
      });
    } catch (error) {
      await this.cleanupDocumentFiles([storedFilePath]);
      throw error;
    }
  }

  findAll(scope: ClinicalAccessScope) {
    this.clinicalPolicy.requireCapability(
      scope,
      OrganizationCapability.DOCUMENT_METADATA_READ,
      'documents.find_all',
    );

    return this.prisma.document.findMany({
      where: {
        organizationId: scope.organizationId,
        caseFile: {
          organizationId: scope.organizationId,
          patient: this.clinicalPolicy.assignedPatientWhere(scope),
        },
      },
      orderBy: {
        uploadedAt: 'desc',
      },
    });
  }

  async findOne(id: string, scope: ClinicalAccessScope) {
    const document = await this.getVisibleDocumentOrThrow(id, scope);
    this.clinicalPolicy.requireCapability(
      scope,
      OrganizationCapability.DOCUMENT_METADATA_READ,
      'documents.find_one',
    );
    await this.requireAssignment(document.caseFile.patientId, scope);
    return stripDocumentRelations(document);
  }

  async findByCaseFileId(caseFileId: string, scope: ClinicalAccessScope) {
    const caseFile = await this.getVisibleCaseFileOrThrow(caseFileId, scope);
    this.clinicalPolicy.requireCapability(
      scope,
      OrganizationCapability.DOCUMENT_METADATA_READ,
      'documents.find_by_case_file',
    );
    await this.requireAssignment(caseFile.patientId, scope);

    return this.prisma.document.findMany({
      where: {
        caseFileId,
        organizationId: scope.organizationId,
      },
      orderBy: {
        uploadedAt: 'desc',
      },
    });
  }

  async update(
    id: string,
    updateDocumentDto: UpdateDocumentDto,
    scope: ClinicalAccessScope,
  ) {
    const document = await this.getVisibleDocumentOrThrow(id, scope);
    this.clinicalPolicy.requireCapability(
      scope,
      OrganizationCapability.DOCUMENT_UPDATE,
      'documents.update',
    );
    await this.requireAssignment(document.caseFile.patientId, scope);
    if (updateDocumentDto.filePath) {
      this.assertSafeStoredDocumentPath(
        updateDocumentDto.filePath,
        document.caseFile.patientId,
      );
    }

    const result = await this.prisma.document.updateMany({
      where: {
        id,
        organizationId: scope.organizationId,
        caseFile: {
          organizationId: scope.organizationId,
          patient: this.clinicalPolicy.assignedPatientWhere(scope),
        },
      },
      data: this.withoutServerFields(updateDocumentDto),
    });

    if (result.count !== 1) {
      throw this.documentNotFound();
    }

    return this.getAssignedDocumentMetadataOrThrow(id, scope);
  }

  async remove(id: string, scope: ClinicalAccessScope) {
    const document = await this.getVisibleDocumentOrThrow(id, scope);
    this.clinicalPolicy.requireCapability(
      scope,
      OrganizationCapability.DOCUMENT_DELETE,
      'documents.remove',
    );
    await this.requireAssignment(document.caseFile.patientId, scope);

    const result = await this.prisma.document.deleteMany({
      where: {
        id,
        organizationId: scope.organizationId,
        caseFile: {
          organizationId: scope.organizationId,
          patient: this.clinicalPolicy.assignedPatientWhere(scope),
        },
      },
    });

    if (result.count !== 1) {
      throw this.documentNotFound();
    }

    await this.cleanupDocumentFile(
      document.filePath,
      document.caseFile.patientId,
    );

    return stripDocumentRelations(document);
  }

  async cleanupDocumentFiles(filePaths: string[]) {
    for (const filePath of filePaths) {
      await this.cleanupDocumentFile(filePath);
    }
  }

  private async cleanupDocumentFile(filePath: string, patientId?: string) {
    try {
      await this.removeDocumentFile(filePath, patientId);
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'document_cleanup_failed',
          errorType: error instanceof Error ? error.name : 'UnknownError',
        }),
      );
    }
  }

  async getDownloadFile(id: string, scope: ClinicalAccessScope) {
    const document = await this.getVisibleDocumentOrThrow(id, scope);
    this.clinicalPolicy.requireCapability(
      scope,
      OrganizationCapability.DOCUMENT_DOWNLOAD,
      'documents.download',
    );
    await this.requireAssignment(document.caseFile.patientId, scope);
    const absoluteFilePath = await this.resolveDocumentFilePath(
      document.filePath,
      document.caseFile.patientId,
    );

    return {
      document: stripDocumentRelations(document),
      absoluteFilePath,
      mimeType: document.mimeType ?? 'application/octet-stream',
    };
  }

  async getViewFile(id: string, scope: ClinicalAccessScope) {
    const document = await this.getVisibleDocumentOrThrow(id, scope);
    this.clinicalPolicy.requireCapability(
      scope,
      OrganizationCapability.DOCUMENT_DOWNLOAD,
      'documents.view',
    );
    await this.requireAssignment(document.caseFile.patientId, scope);
    const absoluteFilePath = await this.resolveDocumentFilePath(
      document.filePath,
      document.caseFile.patientId,
    );

    if (!document.mimeType || !allowedInlineMimeTypes.has(document.mimeType)) {
      throw new BadRequestException(
        'Only PDF, JPG, JPEG and PNG documents can be viewed inline',
      );
    }

    return {
      document: stripDocumentRelations(document),
      absoluteFilePath,
      mimeType: document.mimeType,
    };
  }

  private async getVisibleCaseFileOrThrow(
    caseFileId: string,
    scope: ClinicalAccessScope,
  ) {
    const caseFile = await this.prisma.caseFile.findFirst({
      where: {
        id: caseFileId,
        organizationId: scope.organizationId,
        patient: this.clinicalPolicy.tenantPatientWhere(scope),
      },
      select: { id: true, patientId: true },
    });

    if (!caseFile) {
      throw new NotFoundException('Case file not found');
    }

    return caseFile;
  }

  private toStoredPath(absoluteUploadRoot: string, absoluteFilePath: string) {
    return relative(absoluteUploadRoot, absoluteFilePath).split(sep).join('/');
  }

  private async getVisibleDocumentOrThrow(
    id: string,
    scope: ClinicalAccessScope,
  ) {
    const document = await this.prisma.document.findFirst({
      where: {
        id,
        organizationId: scope.organizationId,
        caseFile: {
          organizationId: scope.organizationId,
          patient: this.clinicalPolicy.tenantPatientWhere(scope),
        },
      },
      include: { caseFile: { select: { patientId: true } } },
    });

    if (!document) {
      throw this.documentNotFound();
    }

    return document;
  }

  private async getAssignedDocumentMetadataOrThrow(
    id: string,
    scope: ClinicalAccessScope,
  ) {
    const document = await this.prisma.document.findFirst({
      where: {
        id,
        organizationId: scope.organizationId,
        caseFile: {
          organizationId: scope.organizationId,
          patient: this.clinicalPolicy.assignedPatientWhere(scope),
        },
      },
    });

    if (!document) {
      throw this.documentNotFound();
    }

    return document;
  }

  private getUploadsRoot() {
    const uploadRoot = this.config.uploadsPath;

    return isAbsolute(uploadRoot)
      ? resolve(uploadRoot)
      : resolve(process.cwd(), uploadRoot);
  }

  private async resolveDocumentFilePath(filePath: string, patientId: string) {
    this.assertSafeStoredDocumentPath(filePath, patientId);
    const { uploadsRoot, candidatePath } = this.getConfinedDocumentPath(
      filePath,
      patientId,
    );

    try {
      await access(candidatePath);
      await this.assertResolvedPathIsWithinUploadsRoot(
        uploadsRoot,
        candidatePath,
      );
    } catch {
      throw new NotFoundException('Document file not found');
    }

    return candidatePath;
  }

  private getConfinedDocumentPath(filePath: string, patientId?: string) {
    const uploadsRoot = this.getUploadsRoot();
    const candidatePath = this.resolveStoredDocumentPath(filePath, uploadsRoot);
    const relativeToUploadsRoot = relative(uploadsRoot, candidatePath);

    if (
      relativeToUploadsRoot.startsWith('..') ||
      isAbsolute(relativeToUploadsRoot)
    ) {
      throw new NotFoundException('Document file not found');
    }

    if (patientId) {
      const normalizedRelativePath = relativeToUploadsRoot.split(sep).join('/');
      if (!normalizedRelativePath.startsWith(`patients/${patientId}/`)) {
        throw new NotFoundException('Document file not found');
      }
    }

    return { uploadsRoot, candidatePath };
  }

  private resolveStoredDocumentPath(filePath: string, uploadsRoot: string) {
    if (isAbsolute(filePath)) {
      return resolve(filePath);
    }

    const legacyProcessRelativePath = resolve(process.cwd(), filePath);
    const relativeLegacyPath = relative(uploadsRoot, legacyProcessRelativePath);
    if (
      !relativeLegacyPath.startsWith('..') &&
      !isAbsolute(relativeLegacyPath)
    ) {
      return legacyProcessRelativePath;
    }

    return resolve(uploadsRoot, filePath);
  }

  private async removeDocumentFile(filePath: string, patientId?: string) {
    const { uploadsRoot, candidatePath } = this.getConfinedDocumentPath(
      filePath,
      patientId,
    );

    try {
      await this.assertResolvedPathIsWithinUploadsRoot(
        uploadsRoot,
        candidatePath,
      );
      await unlink(candidatePath);
    } catch (error) {
      if (getFileSystemErrorCode(error) === 'ENOENT') {
        return;
      }

      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new InternalServerErrorException('Unable to delete document file');
    }
  }

  private async assertResolvedPathIsWithinUploadsRoot(
    uploadsRoot: string,
    candidatePath: string,
  ) {
    const [resolvedUploadsRoot, resolvedCandidatePath] = await Promise.all([
      realpath(uploadsRoot),
      realpath(candidatePath),
    ]);
    const relativeToResolvedUploadsRoot = relative(
      resolvedUploadsRoot,
      resolvedCandidatePath,
    );

    if (
      relativeToResolvedUploadsRoot.startsWith('..') ||
      isAbsolute(relativeToResolvedUploadsRoot)
    ) {
      throw new NotFoundException('Document file not found');
    }
  }

  private async requireAssignment(
    patientId: string,
    scope: ClinicalAccessScope,
  ) {
    const assignment = await this.prisma.patientAssignment.findFirst({
      where: {
        ...this.clinicalPolicy.assignmentWhere(scope),
        patientId,
        patient: this.clinicalPolicy.tenantPatientWhere(scope),
      },
      select: { id: true },
    });

    if (!assignment) {
      throw new ForbiddenException('Clinical assignment is required');
    }
  }

  private assertSafeStoredDocumentPath(filePath: string, patientId: string) {
    if (filePath.includes('\0') || isAbsolute(filePath)) {
      throw new BadRequestException('Invalid document storage path');
    }

    let decodedPath = filePath;
    try {
      decodedPath = decodeURIComponent(filePath);
    } catch {
      throw new BadRequestException('Invalid document storage path');
    }

    if (
      decodedPath.includes('\0') ||
      isAbsolute(decodedPath) ||
      hasParentTraversal(decodedPath)
    ) {
      throw new BadRequestException('Invalid document storage path');
    }

    const { uploadsRoot, candidatePath } = this.getConfinedDocumentPath(
      filePath,
      patientId,
    );
    const relativeToUploadsRoot = relative(uploadsRoot, candidatePath)
      .split(sep)
      .join('/');
    if (!relativeToUploadsRoot.startsWith(`patients/${patientId}/`)) {
      throw new BadRequestException('Invalid document storage path');
    }
  }

  private withoutServerFields<T extends object>(
    dto: T,
  ): Omit<T, 'organizationId' | 'uploadedById'> {
    const documentData = { ...dto };
    Reflect.deleteProperty(documentData, 'organizationId');
    Reflect.deleteProperty(documentData, 'uploadedById');
    return documentData;
  }

  private documentNotFound() {
    return new NotFoundException('Document not found');
  }
}

function getFileSystemErrorCode(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error) {
    return error.code;
  }

  return undefined;
}

function hasParentTraversal(filePath: string) {
  return filePath
    .replace(/\\/g, '/')
    .split('/')
    .some((segment) => segment === '..');
}

type AuthorizedDocument = Prisma.DocumentGetPayload<{
  include: { caseFile: { select: { patientId: true } } };
}>;

function stripDocumentRelations(document: AuthorizedDocument) {
  const metadata = { ...document };
  Reflect.deleteProperty(metadata, 'caseFile');
  return metadata;
}
