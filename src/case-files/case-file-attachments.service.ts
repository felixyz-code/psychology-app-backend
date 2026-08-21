import { randomUUID } from 'node:crypto';
import { access, mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AttachmentCategory } from '@prisma/client';
import { AppConfigService } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { ClinicalAccessPolicyService } from '../tenant-context/clinical-access-policy.service';
import type { ClinicalAccessScope } from '../tenant-context/clinical-access.types';
import { OrganizationCapability } from '../tenant-context/authorization/organization-capability';
import { UploadCaseFileAttachmentDto } from './dto/upload-case-file-attachment.dto';
import { validateCaseFileAttachmentFile } from './case-file-attachment.validation';

const allowedInlineMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

@Injectable()
export class CaseFileAttachmentsService {
  private readonly logger = new Logger(CaseFileAttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly clinicalPolicy: ClinicalAccessPolicyService,
  ) {}

  async upload(
    caseFileId: string,
    uploadDto: UploadCaseFileAttachmentDto,
    file: Express.Multer.File,
    scope: ClinicalAccessScope,
  ) {
    const caseFile = await this.getVisibleCaseFileOrThrow(caseFileId, scope);
    this.clinicalPolicy.requireCapability(
      scope,
      OrganizationCapability.DOCUMENT_UPLOAD,
      'case_file_attachments.upload',
    );
    await this.requireAssignment(caseFile.patientId, scope);
    validateCaseFileAttachmentFile(file);

    const extension = extname(file.originalname).toLowerCase();
    const safeFileName = `${randomUUID()}${extension}`;
    const uploadRoot = this.config.uploadsPath;
    const absoluteUploadRoot = isAbsolute(uploadRoot)
      ? uploadRoot
      : join(process.cwd(), uploadRoot);
    const attachmentDirectory = join(
      absoluteUploadRoot,
      'patients',
      caseFile.patientId,
      'attachments',
    );
    const absoluteFilePath = join(attachmentDirectory, safeFileName);
    const storedFilePath = this.toStoredPath(
      absoluteUploadRoot,
      absoluteFilePath,
    );

    await mkdir(attachmentDirectory, { recursive: true });
    await writeFile(absoluteFilePath, file.buffer, { flag: 'wx' });

    try {
      return await this.prisma.caseFileAttachment.create({
        data: {
          caseFileId,
          organizationId: scope.organizationId,
          uploadedById: scope.userId,
          fileName: safeFileName,
          originalName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size || file.buffer.length,
          category: uploadDto.category || AttachmentCategory.OTRO,
          notes: uploadDto.notes || null,
          filePath: storedFilePath,
        },
        include: {
          uploadedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
    } catch (error) {
      await this.cleanupAttachmentFile(storedFilePath, caseFile.patientId);
      throw error;
    }
  }

  async findByCaseFileId(caseFileId: string, scope: ClinicalAccessScope) {
    const caseFile = await this.getVisibleCaseFileOrThrow(caseFileId, scope);
    this.clinicalPolicy.requireCapability(
      scope,
      OrganizationCapability.DOCUMENT_METADATA_READ,
      'case_file_attachments.find_by_case_file',
    );
    await this.requireAssignment(caseFile.patientId, scope);

    return this.prisma.caseFileAttachment.findMany({
      where: {
        caseFileId,
        organizationId: scope.organizationId,
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getDownloadFile(
    caseFileId: string,
    attachmentId: string,
    scope: ClinicalAccessScope,
  ) {
    const attachment = await this.getVisibleAttachmentOrThrow(
      caseFileId,
      attachmentId,
      scope,
    );
    this.clinicalPolicy.requireCapability(
      scope,
      OrganizationCapability.DOCUMENT_DOWNLOAD,
      'case_file_attachments.download',
    );
    await this.requireAssignment(attachment.caseFile.patientId, scope);

    const absoluteFilePath = await this.resolveAttachmentFilePath(
      attachment.filePath,
      attachment.caseFile.patientId,
    );

    return {
      attachment,
      absoluteFilePath,
      mimeType: attachment.mimeType,
      originalName: attachment.originalName,
    };
  }

  async getViewFile(
    caseFileId: string,
    attachmentId: string,
    scope: ClinicalAccessScope,
  ) {
    const attachment = await this.getVisibleAttachmentOrThrow(
      caseFileId,
      attachmentId,
      scope,
    );
    this.clinicalPolicy.requireCapability(
      scope,
      OrganizationCapability.DOCUMENT_DOWNLOAD,
      'case_file_attachments.view',
    );
    await this.requireAssignment(attachment.caseFile.patientId, scope);

    if (!allowedInlineMimeTypes.has(attachment.mimeType)) {
      throw new BadRequestException(
        'Only PDF, JPG, PNG and WEBP attachments can be viewed inline',
      );
    }

    const absoluteFilePath = await this.resolveAttachmentFilePath(
      attachment.filePath,
      attachment.caseFile.patientId,
    );

    return {
      attachment,
      absoluteFilePath,
      mimeType: attachment.mimeType,
    };
  }

  async remove(
    caseFileId: string,
    attachmentId: string,
    scope: ClinicalAccessScope,
  ) {
    const attachment = await this.getVisibleAttachmentOrThrow(
      caseFileId,
      attachmentId,
      scope,
    );
    this.clinicalPolicy.requireCapability(
      scope,
      OrganizationCapability.DOCUMENT_DELETE,
      'case_file_attachments.remove',
    );
    await this.requireAssignment(attachment.caseFile.patientId, scope);

    const result = await this.prisma.caseFileAttachment.deleteMany({
      where: {
        id: attachmentId,
        caseFileId,
        organizationId: scope.organizationId,
      },
    });

    if (result.count !== 1) {
      throw new NotFoundException('Attachment not found');
    }

    await this.cleanupAttachmentFile(
      attachment.filePath,
      attachment.caseFile.patientId,
    );

    return attachment;
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

  private async getVisibleAttachmentOrThrow(
    caseFileId: string,
    attachmentId: string,
    scope: ClinicalAccessScope,
  ) {
    const attachment = await this.prisma.caseFileAttachment.findFirst({
      where: {
        id: attachmentId,
        caseFileId,
        organizationId: scope.organizationId,
        caseFile: {
          organizationId: scope.organizationId,
          patient: this.clinicalPolicy.tenantPatientWhere(scope),
        },
      },
      include: {
        caseFile: { select: { patientId: true } },
        uploadedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    return attachment;
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

  private toStoredPath(absoluteUploadRoot: string, absoluteFilePath: string) {
    return relative(absoluteUploadRoot, absoluteFilePath).split(sep).join('/');
  }

  private getUploadsRoot() {
    const uploadRoot = this.config.uploadsPath;

    return isAbsolute(uploadRoot)
      ? resolve(uploadRoot)
      : resolve(process.cwd(), uploadRoot);
  }

  private async resolveAttachmentFilePath(
    filePath: string,
    patientId: string,
  ) {
    const { uploadsRoot, candidatePath } = this.getConfinedAttachmentPath(
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
      throw new NotFoundException('Attachment file not found');
    }

    return candidatePath;
  }

  private getConfinedAttachmentPath(filePath: string, patientId?: string) {
    const uploadsRoot = this.getUploadsRoot();
    const candidatePath = this.resolveStoredAttachmentPath(filePath, uploadsRoot);
    const relativeToUploadsRoot = relative(uploadsRoot, candidatePath);

    if (
      relativeToUploadsRoot.startsWith('..') ||
      isAbsolute(relativeToUploadsRoot)
    ) {
      throw new NotFoundException('Attachment file not found');
    }

    if (patientId) {
      const normalizedRelativePath = relativeToUploadsRoot
        .split(sep)
        .join('/');
      if (!normalizedRelativePath.startsWith(`patients/${patientId}/`)) {
        throw new NotFoundException('Attachment file not found');
      }
    }

    return { uploadsRoot, candidatePath };
  }

  private resolveStoredAttachmentPath(
    filePath: string,
    uploadsRoot: string,
  ) {
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

  private async cleanupAttachmentFile(filePath: string, patientId?: string) {
    try {
      const { candidatePath } = this.getConfinedAttachmentPath(
        filePath,
        patientId,
      );
      await unlink(candidatePath);
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          event: 'attachment_cleanup_failed',
          errorType: error instanceof Error ? error.name : 'UnknownError',
        }),
      );
    }
  }

  private async assertResolvedPathIsWithinUploadsRoot(
    uploadsRoot: string,
    candidatePath: string,
  ) {
    const canonicalUploadsRoot = resolve(uploadsRoot);
    const canonicalCandidate = resolve(candidatePath);
    const relativePath = relative(canonicalUploadsRoot, canonicalCandidate);

    if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new NotFoundException('Attachment file not found');
    }
  }
}
