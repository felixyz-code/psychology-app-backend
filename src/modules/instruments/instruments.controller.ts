import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { OrganizationStatus } from '@prisma/client';
import { AuditLog } from '../../audit-logs/decorators/audit-log.decorator';
import { OrganizationCapability } from '../../tenant-context/authorization/organization-capability';
import { RequireCapabilities } from '../../tenant-context/authorization/require-capabilities.decorator';
import { AllowedOrganizationStatuses } from '../../tenant-context/decorators/allowed-organization-statuses.decorator';
import { CurrentTenant } from '../../tenant-context/decorators/current-tenant.decorator';
import { TenantRequired } from '../../tenant-context/decorators/tenant-required.decorator';
import type { TenantContext } from '../../tenant-context/tenant-context.types';
import { CreateInstrumentVersionDto } from './dto/create-instrument-version.dto';
import { CreateInstrumentDto } from './dto/create-instrument.dto';
import { ToggleVisibilityDto } from './dto/toggle-visibility.dto';
import { InstrumentsService } from './instruments.service';
import type { AssessmentResponseMap } from './scoring/scoring.types';

@ApiTags('clinical-instruments')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Authentication is required' })
@ApiForbiddenResponse({ description: 'Forbidden tenant access' })
@ApiHeader({
  name: 'X-Organization-Id',
  required: false,
  description: 'Optional UUID selection hint for tenant context.',
})
@TenantRequired()
@AllowedOrganizationStatuses(
  OrganizationStatus.ACTIVE,
  OrganizationStatus.PROVISIONING,
)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@Controller('instruments')
export class InstrumentsController {
  constructor(private readonly instrumentsService: InstrumentsService) {}

  @Get()
  @ApiOperation({
    summary:
      'List all accessible clinical instruments (Global stock & Tenant custom)',
  })
  @ApiOkResponse({ description: 'List of accessible instruments returned' })
  findAll(@CurrentTenant(true) tenant: TenantContext) {
    return this.instrumentsService.findAll(tenant.organizationId);
  }

  @Get('catalog')
  @ApiOperation({
    summary:
      'List active, published and tenant-enabled clinical instruments for patient assignment',
  })
  @ApiOkResponse({
    description: 'Clinical instruments available for assignment',
  })
  findClinicalCatalog(@CurrentTenant(true) tenant: TenantContext) {
    return this.instrumentsService.findClinicalCatalog(tenant.organizationId);
  }

  @Get('management/instruments')
  @RequireCapabilities(OrganizationCapability.ASSESSMENT_TEMPLATE_MANAGE)
  @ApiOperation({
    summary:
      'List all instruments with administration stats, version states, and visibility toggles',
  })
  @ApiOkResponse({
    description: 'Complete management catalog for tenant',
  })
  findManagementCatalog(@CurrentTenant(true) tenant: TenantContext) {
    return this.instrumentsService.findManagementCatalog(tenant.organizationId);
  }

  @Post('management/instruments')
  @RequireCapabilities(OrganizationCapability.ASSESSMENT_TEMPLATE_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  @AuditLog({ action: 'INSTRUMENT_CREATE', resourceType: 'Instrument' })
  @ApiOperation({
    summary: 'Create a new custom tenant instrument catalog entry',
  })
  @ApiCreatedResponse({ description: 'Custom instrument created successfully' })
  @ApiConflictResponse({
    description: 'Instrument code already exists (INSTRUMENT_CODE_EXISTS)',
  })
  createManagementInstrument(
    @CurrentTenant(true) tenant: TenantContext,
    @Body() dto: CreateInstrumentDto,
  ) {
    return this.instrumentsService.create(tenant.organizationId, dto);
  }

  @Patch('management/instruments/:id/visibility')
  @RequireCapabilities(OrganizationCapability.ASSESSMENT_TEMPLATE_MANAGE)
  @AuditLog({
    action: 'INSTRUMENT_VISIBILITY_TOGGLE',
    resourceType: 'TenantInstrumentConfig',
  })
  @ApiOperation({
    summary: 'Toggle visibility (enabled/disabled) of an instrument for tenant',
  })
  @ApiParam({ name: 'id', description: 'Instrument UUID' })
  @ApiOkResponse({ description: 'Visibility configuration updated' })
  @ApiNotFoundResponse({ description: 'Instrument not found' })
  toggleVisibility(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ToggleVisibilityDto,
  ) {
    return this.instrumentsService.toggleVisibility(
      tenant.organizationId,
      id,
      dto.isEnabled,
    );
  }

  @Post('management/instruments/:id/versions')
  @RequireCapabilities(OrganizationCapability.ASSESSMENT_TEMPLATE_MANAGE)
  @HttpCode(HttpStatus.CREATED)
  @AuditLog({
    action: 'INSTRUMENT_VERSION_CREATE',
    resourceType: 'InstrumentVersion',
  })
  @ApiOperation({
    summary: 'Create a new draft version for a custom tenant instrument (vN+1)',
  })
  @ApiParam({ name: 'id', description: 'Instrument UUID' })
  @ApiCreatedResponse({ description: 'Draft version created successfully' })
  @ApiNotFoundResponse({ description: 'Custom instrument not found' })
  createManagementVersion(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('id', ParseUUIDPipe) instrumentId: string,
    @Body() dto: CreateInstrumentVersionDto,
  ) {
    return this.instrumentsService.createVersion(
      tenant.organizationId,
      instrumentId,
      dto,
    );
  }

  @Put('management/instruments/:id/versions/:versionId')
  @RequireCapabilities(OrganizationCapability.ASSESSMENT_TEMPLATE_MANAGE)
  @AuditLog({
    action: 'INSTRUMENT_VERSION_UPDATE',
    resourceType: 'InstrumentVersion',
  })
  @ApiOperation({
    summary: 'Edit a DRAFT instrument version specification',
  })
  @ApiParam({ name: 'id', description: 'Instrument UUID' })
  @ApiParam({ name: 'versionId', description: 'InstrumentVersion UUID' })
  @ApiOkResponse({ description: 'Draft version updated successfully' })
  @ApiForbiddenResponse({
    description:
      'Published or in-use versions are immutable (PUBLISHED_VERSION_IMMUTABLE)',
  })
  @ApiNotFoundResponse({ description: 'Version not found' })
  putManagementDraftVersion(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body() dto: CreateInstrumentVersionDto,
  ) {
    return this.instrumentsService.updateDraftVersion(
      tenant.organizationId,
      versionId,
      dto,
    );
  }

  @Post('management/instruments/:id/versions/:versionId/publish')
  @RequireCapabilities(OrganizationCapability.ASSESSMENT_TEMPLATE_MANAGE)
  @AuditLog({
    action: 'INSTRUMENT_VERSION_PUBLISH',
    resourceType: 'InstrumentVersion',
  })
  @ApiOperation({
    summary: 'Publish a draft version for clinical assignment',
  })
  @ApiParam({ name: 'id', description: 'Instrument UUID' })
  @ApiParam({ name: 'versionId', description: 'InstrumentVersion UUID' })
  @ApiOkResponse({ description: 'Version published successfully' })
  @ApiNotFoundResponse({ description: 'Version not found' })
  publishManagementVersion(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.instrumentsService.publishVersion(
      tenant.organizationId,
      versionId,
    );
  }

  @Post('management/instruments/:id/versions/:versionId/deprecate')
  @RequireCapabilities(OrganizationCapability.ASSESSMENT_TEMPLATE_MANAGE)
  @AuditLog({
    action: 'INSTRUMENT_VERSION_DEPRECATE',
    resourceType: 'InstrumentVersion',
  })
  @ApiOperation({
    summary: 'Deprecate an instrument version',
  })
  @ApiParam({ name: 'id', description: 'Instrument UUID' })
  @ApiParam({ name: 'versionId', description: 'InstrumentVersion UUID' })
  @ApiOkResponse({ description: 'Version deprecated successfully' })
  @ApiNotFoundResponse({ description: 'Version not found' })
  deprecateManagementVersion(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.instrumentsService.deprecateVersion(
      tenant.organizationId,
      versionId,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @AuditLog({ action: 'INSTRUMENT_CREATE', resourceType: 'Instrument' })
  @ApiOperation({
    summary: 'Create a new custom tenant instrument catalog entry',
  })
  @ApiCreatedResponse({ description: 'Custom instrument created successfully' })
  @ApiConflictResponse({
    description: 'Instrument code already exists (INSTRUMENT_CODE_EXISTS)',
  })
  create(
    @CurrentTenant(true) tenant: TenantContext,
    @Body() dto: CreateInstrumentDto,
  ) {
    return this.instrumentsService.create(tenant.organizationId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get instrument details with version history' })
  @ApiParam({ name: 'id', description: 'Instrument UUID' })
  @ApiOkResponse({ description: 'Instrument details retrieved' })
  @ApiNotFoundResponse({ description: 'Instrument not found' })
  findOne(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.instrumentsService.findOne(tenant.organizationId, id);
  }

  @Post(':id/versions')
  @HttpCode(HttpStatus.CREATED)
  @AuditLog({
    action: 'INSTRUMENT_VERSION_CREATE',
    resourceType: 'InstrumentVersion',
  })
  @ApiOperation({
    summary: 'Create a new draft version for a custom tenant instrument',
  })
  @ApiParam({ name: 'id', description: 'Instrument UUID' })
  @ApiCreatedResponse({ description: 'Draft version created successfully' })
  @ApiNotFoundResponse({ description: 'Custom instrument not found' })
  createVersion(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('id', ParseUUIDPipe) instrumentId: string,
    @Body() dto: CreateInstrumentVersionDto,
  ) {
    return this.instrumentsService.createVersion(
      tenant.organizationId,
      instrumentId,
      dto,
    );
  }

  @Get('versions/:versionId')
  @ApiOperation({
    summary: 'Get specific version details (definition & scoring spec)',
  })
  @ApiParam({ name: 'versionId', description: 'InstrumentVersion UUID' })
  @ApiOkResponse({ description: 'Version details retrieved' })
  @ApiNotFoundResponse({ description: 'Version not found' })
  getVersionDetails(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.instrumentsService.getVersionDetails(
      tenant.organizationId,
      versionId,
    );
  }

  @Patch('versions/:versionId')
  @AuditLog({
    action: 'INSTRUMENT_VERSION_UPDATE',
    resourceType: 'InstrumentVersion',
  })
  @ApiOperation({ summary: 'Update a DRAFT instrument version specification' })
  @ApiParam({ name: 'versionId', description: 'InstrumentVersion UUID' })
  @ApiOkResponse({ description: 'Draft version updated' })
  @ApiForbiddenResponse({
    description:
      'Published versions are immutable (PUBLISHED_VERSION_IMMUTABLE)',
  })
  @ApiNotFoundResponse({ description: 'Version not found' })
  updateDraftVersion(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body() dto: CreateInstrumentVersionDto,
  ) {
    return this.instrumentsService.updateDraftVersion(
      tenant.organizationId,
      versionId,
      dto,
    );
  }

  @Post('versions/:versionId/publish')
  @AuditLog({
    action: 'INSTRUMENT_VERSION_PUBLISH',
    resourceType: 'InstrumentVersion',
  })
  @ApiOperation({
    summary: 'Publish a draft version (locks definition as immutable)',
  })
  @ApiParam({ name: 'versionId', description: 'InstrumentVersion UUID' })
  @ApiOkResponse({ description: 'Version published successfully' })
  @ApiNotFoundResponse({ description: 'Version not found' })
  publishVersion(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    return this.instrumentsService.publishVersion(
      tenant.organizationId,
      versionId,
    );
  }

  @Post('versions/:versionId/calculate-score')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Calculate psychometric score for given responses using specific instrument version',
  })
  @ApiParam({ name: 'versionId', description: 'InstrumentVersion UUID' })
  @ApiOkResponse({ description: 'Psychometric score calculated successfully' })
  @ApiNotFoundResponse({ description: 'Version not found' })
  calculateScore(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body() responses: Record<string, any>,
  ) {
    return this.instrumentsService.calculateScoreForVersion(
      tenant.organizationId,
      versionId,
      responses as AssessmentResponseMap,
    );
  }
}
