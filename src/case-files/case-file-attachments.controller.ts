import { createReadStream } from 'node:fs';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { AuditLog } from '../audit-logs/decorators/audit-log.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CurrentTenant } from '../tenant-context/decorators/current-tenant.decorator';
import { TenantRequired } from '../tenant-context/decorators/tenant-required.decorator';
import type { ClinicalAccessScope } from '../tenant-context/clinical-access.types';
import type { TenantContext } from '../tenant-context/tenant-context.types';
import { CaseFileAttachmentsService } from './case-file-attachments.service';
import { CaseFileAttachmentResponseDto } from './dto/case-file-attachment-response.dto';
import { UploadCaseFileAttachmentDto } from './dto/upload-case-file-attachment.dto';
import {
  hasAllowedCaseFileAttachmentMetadata,
  MAX_ATTACHMENT_SIZE_BYTES,
} from './case-file-attachment.validation';

@ApiTags('case-file-attachments')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({
  description: 'Missing, invalid, or expired Bearer JWT',
})
@ApiForbiddenResponse({
  description: 'Authenticated user lacks a permitted role',
})
@TenantRequired()
@Controller('case-files/:id/attachments')
@Roles(UserRole.ADMIN, UserRole.PSYCHOLOGIST)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
  }),
)
export class CaseFileAttachmentsController {
  constructor(
    private readonly attachmentsService: CaseFileAttachmentsService,
  ) {}

  @Post()
  @AuditLog({
    action: 'CLINICAL_ATTACHMENT_UPLOAD',
    resourceType: 'CaseFileAttachment',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: MAX_ATTACHMENT_SIZE_BYTES,
      },
      fileFilter: (_request, file, callback) => {
        if (!hasAllowedCaseFileAttachmentMetadata(file)) {
          callback(
            new BadRequestException(
              'Only PDF, JPG, PNG, WEBP, DOC and DOCX files are allowed',
            ),
            false,
          );
          return;
        }

        callback(null, true);
      },
    }),
  )
  @ApiOperation({
    summary: 'Upload an attachment file to a clinical case file',
  })
  @ApiConsumes('multipart/form-data')
  @ApiParam({
    name: 'id',
    description: 'Case file ID',
    format: 'uuid',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        category: {
          type: 'string',
          enum: [
            'ESTUDIO_PREVIO',
            'REPORTE_ESCOLAR',
            'IDENTIFICACION',
            'OTRO',
          ],
          default: 'OTRO',
        },
        notes: {
          type: 'string',
          description: 'Clinical notes or observations',
        },
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'Attachment uploaded and registered successfully',
    type: CaseFileAttachmentResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid upload payload, unsupported file, or exceeds 10MB',
  })
  @ApiNotFoundResponse({ description: 'Case file not found' })
  upload(
    @Param('id', ParseUUIDPipe) caseFileId: string,
    @Body() uploadDto: UploadCaseFileAttachmentDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    if (!file) {
      throw new BadRequestException('A file is required for upload');
    }

    return this.attachmentsService.upload(
      caseFileId,
      uploadDto,
      file,
      this.createScope(tenant, user),
    );
  }

  @Get()
  @AuditLog({
    action: 'CLINICAL_ATTACHMENT_READ',
    resourceType: 'CaseFileAttachment',
  })
  @ApiOperation({ summary: 'List all attachments of a case file' })
  @ApiParam({
    name: 'id',
    description: 'Case file ID',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Attachments list retrieved successfully',
    type: CaseFileAttachmentResponseDto,
    isArray: true,
  })
  @ApiNotFoundResponse({ description: 'Case file not found' })
  findAll(
    @Param('id', ParseUUIDPipe) caseFileId: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.attachmentsService.findByCaseFileId(
      caseFileId,
      this.createScope(tenant, user),
    );
  }

  @Get(':attachmentId/download')
  @AuditLog({
    action: 'CLINICAL_ATTACHMENT_DOWNLOAD',
    resourceType: 'CaseFileAttachment',
  })
  @ApiOperation({
    summary: 'Download a case file attachment safely by attachment ID',
  })
  @ApiParam({
    name: 'id',
    description: 'Case file ID',
    format: 'uuid',
  })
  @ApiParam({
    name: 'attachmentId',
    description: 'Attachment ID',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Binary stream of the attachment file',
    content: {
      'application/octet-stream': {
        schema: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Case file or attachment not found',
  })
  async download(
    @Param('id', ParseUUIDPipe) caseFileId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { absoluteFilePath, mimeType, originalName } =
      await this.attachmentsService.getDownloadFile(
        caseFileId,
        attachmentId,
        this.createScope(tenant, user),
      );

    response.setHeader('Content-Type', mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(originalName)}"`,
    );

    return new StreamableFile(createReadStream(absoluteFilePath));
  }

  @Get(':attachmentId/view')
  @AuditLog({
    action: 'CLINICAL_ATTACHMENT_VIEW',
    resourceType: 'CaseFileAttachment',
  })
  @ApiOperation({
    summary: 'View an attachment file inline by attachment ID (PDF or Image)',
  })
  @ApiParam({
    name: 'id',
    description: 'Case file ID',
    format: 'uuid',
  })
  @ApiParam({
    name: 'attachmentId',
    description: 'Attachment ID',
    format: 'uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Attachment file returned inline for preview',
    content: {
      'application/pdf': { schema: { type: 'string', format: 'binary' } },
      'image/jpeg': { schema: { type: 'string', format: 'binary' } },
      'image/png': { schema: { type: 'string', format: 'binary' } },
      'image/webp': { schema: { type: 'string', format: 'binary' } },
    },
  })
  @ApiBadRequestResponse({
    description: 'Unsupported inline viewing format for this file type',
  })
  @ApiNotFoundResponse({
    description: 'Case file or attachment not found',
  })
  async view(
    @Param('id', ParseUUIDPipe) caseFileId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { attachment, absoluteFilePath, mimeType } =
      await this.attachmentsService.getViewFile(
        caseFileId,
        attachmentId,
        this.createScope(tenant, user),
      );

    response.setHeader('Content-Type', mimeType);
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(attachment.originalName)}"`,
    );

    return new StreamableFile(createReadStream(absoluteFilePath));
  }

  @Delete(':attachmentId')
  @AuditLog({
    action: 'CLINICAL_ATTACHMENT_DELETE',
    resourceType: 'CaseFileAttachment',
  })
  @ApiOperation({ summary: 'Delete a case file attachment' })
  @ApiParam({
    name: 'id',
    description: 'Case file ID',
    format: 'uuid',
  })
  @ApiParam({
    name: 'attachmentId',
    description: 'Attachment ID',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Attachment deleted successfully',
    type: CaseFileAttachmentResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Case file or attachment not found' })
  remove(
    @Param('id', ParseUUIDPipe) caseFileId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.attachmentsService.remove(
      caseFileId,
      attachmentId,
      this.createScope(tenant, user),
    );
  }

  private createScope(
    tenant: TenantContext,
    user: AuthenticatedUser,
  ): ClinicalAccessScope {
    return {
      organizationId: tenant.organizationId,
      membershipId: tenant.membershipId,
      organizationRole: tenant.organizationRole,
      userId: user.id,
      legacyUserRole: tenant.legacyUserRole,
      resolutionMode: tenant.resolutionMode,
    };
  }
}
