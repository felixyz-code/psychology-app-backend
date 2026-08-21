import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuditLog } from '../audit-logs/decorators/audit-log.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CurrentTenant } from '../tenant-context/decorators/current-tenant.decorator';
import { TenantRequired } from '../tenant-context/decorators/tenant-required.decorator';
import type { ClinicalAccessScope } from '../tenant-context/clinical-access.types';
import type { TenantContext } from '../tenant-context/tenant-context.types';
import { CaseFilesService } from './case-files.service';
import { CaseFileWorkspaceResponseDto } from './dto/case-file-workspace-response.dto';
import { CreateCaseFileDto } from './dto/create-case-file.dto';
import { UpdateCaseFileDto } from './dto/update-case-file.dto';
import { CaseFileResponseDto } from './dto/case-file-response.dto';
import { ClinicalPdfExportPayloadDto } from './dto/clinical-pdf-data.dto';

@ApiTags('case-files')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({
  description: 'Missing, invalid, or expired Bearer JWT',
})
@ApiForbiddenResponse({
  description: 'Authenticated user lacks a permitted role',
})
@TenantRequired()
@Controller('case-files')
@Roles(UserRole.ADMIN, UserRole.PSYCHOLOGIST)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
  }),
)
export class CaseFilesController {
  constructor(private readonly caseFilesService: CaseFilesService) {}

  @Post()
  @AuditLog({ action: 'CLINICAL_CASE_FILE_CREATE', resourceType: 'CaseFile' })
  @ApiOperation({ summary: 'Create a case file' })
  @ApiBody({ type: CreateCaseFileDto })
  @ApiCreatedResponse({
    description: 'Case file created successfully',
    type: CaseFileResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid case file payload' })
  @ApiConflictResponse({
    description: 'The patient already has an existing case file',
  })
  @ApiNotFoundResponse({ description: 'Patient not found' })
  create(
    @Body() createCaseFileDto: CreateCaseFileDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.caseFilesService.create(
      createCaseFileDto,
      this.createScope(tenant, user),
    );
  }

  @Get()
  @AuditLog({ action: 'CLINICAL_CASE_FILE_READ', resourceType: 'CaseFile' })
  @ApiOperation({ summary: 'List all case files' })
  @ApiOkResponse({
    description: 'Case files retrieved successfully',
    type: CaseFileResponseDto,
    isArray: true,
  })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.caseFilesService.findAll(this.createScope(tenant, user));
  }

  @Get('patient/:patientId')
  @AuditLog({ action: 'CLINICAL_CASE_FILE_READ', resourceType: 'CaseFile' })
  @ApiOperation({ summary: 'Get a case file by patient ID' })
  @ApiParam({
    name: 'patientId',
    description: 'Patient ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Case file retrieved successfully',
    type: CaseFileResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid patient ID' })
  @ApiNotFoundResponse({ description: 'Patient or case file not found' })
  findByPatientId(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.caseFilesService.findByPatientId(
      patientId,
      this.createScope(tenant, user),
    );
  }

  @Get(':id/workspace')
  @AuditLog({ action: 'CLINICAL_CASE_FILE_READ', resourceType: 'CaseFile' })
  @ApiOperation({ summary: 'Get a clinical workspace by case file ID' })
  @ApiParam({
    name: 'id',
    description: 'Case file ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Clinical workspace retrieved successfully',
    type: CaseFileWorkspaceResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid case file ID' })
  @ApiNotFoundResponse({ description: 'Case file not found' })
  findWorkspace(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.caseFilesService.findWorkspace(
      id,
      this.createScope(tenant, user),
    );
  }

  @Get(':id')
  @AuditLog({ action: 'CLINICAL_CASE_FILE_READ', resourceType: 'CaseFile' })
  @ApiOperation({ summary: 'Get a case file by ID' })
  @ApiParam({
    name: 'id',
    description: 'Case file ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Case file retrieved successfully',
    type: CaseFileResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid case file ID' })
  @ApiNotFoundResponse({ description: 'Case file not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.caseFilesService.findOne(id, this.createScope(tenant, user));
  }

  @Patch(':id')
  @AuditLog({ action: 'CLINICAL_CASE_FILE_UPDATE', resourceType: 'CaseFile' })
  @ApiOperation({ summary: 'Update a case file' })
  @ApiParam({
    name: 'id',
    description: 'Case file ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({ type: UpdateCaseFileDto })
  @ApiOkResponse({
    description: 'Case file updated successfully',
    type: CaseFileResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid case file payload or ID' })
  @ApiNotFoundResponse({ description: 'Case file not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateCaseFileDto: UpdateCaseFileDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.caseFilesService.update(
      id,
      updateCaseFileDto,
      this.createScope(tenant, user),
    );
  }

  @Get(':id/pdf-data')
  @AuditLog({ action: 'CLINICAL_DOCUMENT_EXPORT', resourceType: 'CaseFile' })
  @ApiOperation({ summary: 'Get clinical PDF export payload for case file' })
  @ApiParam({
    name: 'id',
    description: 'Case file ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Clinical PDF export payload retrieved successfully',
    type: ClinicalPdfExportPayloadDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid case file ID' })
  @ApiNotFoundResponse({ description: 'Case file not found' })
  getPdfData(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.caseFilesService.getClinicalPdfData(
      id,
      this.createScope(tenant, user),
    );
  }

  @Get(':id/notes/:noteId/pdf-data')
  @AuditLog({ action: 'CLINICAL_DOCUMENT_EXPORT', resourceType: 'SessionNote' })
  @ApiOperation({ summary: 'Get NOM-004 evolution note PDF export payload' })
  @ApiParam({
    name: 'id',
    description: 'Case file ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiParam({
    name: 'noteId',
    description: 'Session note ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Evolution note PDF export payload retrieved successfully',
    type: ClinicalPdfExportPayloadDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid case file ID or note ID' })
  @ApiNotFoundResponse({ description: 'Case file or session note not found' })
  getNotePdfData(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.caseFilesService.getClinicalPdfData(
      id,
      this.createScope(tenant, user),
      noteId,
    );
  }

  @Get(':id/consent-data')
  @AuditLog({ action: 'CLINICAL_DOCUMENT_EXPORT', resourceType: 'CaseFile' })
  @ApiOperation({ summary: 'Get informed consent PDF export payload' })
  @ApiParam({
    name: 'id',
    description: 'Case file ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Informed consent export payload retrieved successfully',
    type: ClinicalPdfExportPayloadDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid case file ID' })
  @ApiNotFoundResponse({ description: 'Case file not found' })
  getConsentData(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.caseFilesService.getConsentPdfData(
      id,
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
