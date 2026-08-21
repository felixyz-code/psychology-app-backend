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
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
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
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { OrganizationStatus } from '@prisma/client';
import { AuditLog } from '../../audit-logs/decorators/audit-log.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import { AllowedOrganizationStatuses } from '../../tenant-context/decorators/allowed-organization-statuses.decorator';
import { CurrentTenant } from '../../tenant-context/decorators/current-tenant.decorator';
import { TenantRequired } from '../../tenant-context/decorators/tenant-required.decorator';
import type { TenantContext } from '../../tenant-context/tenant-context.types';
import { AssessmentsService } from './assessments.service';
import { AssignAssessmentDto } from './dto/assign-assessment.dto';
import { QueryAdministrationsDto } from './dto/query-administrations.dto';
import { QueryLongitudinalDto } from './dto/query-longitudinal.dto';
import { SaveResponsesDto } from './dto/save-responses.dto';

@ApiTags('assessments')
@TenantRequired()
@AllowedOrganizationStatuses(
  OrganizationStatus.ACTIVE,
  OrganizationStatus.PROVISIONING,
)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@Controller('assessments')
export class AssessmentsController {
  constructor(private readonly assessmentsService: AssessmentsService) {}

  @ApiBearerAuth('bearer')
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  @ApiForbiddenResponse({ description: 'Forbidden tenant access' })
  @ApiHeader({
    name: 'X-Organization-Id',
    required: false,
    description: 'Optional UUID selection hint for tenant context.',
  })
  @Post('administrations')
  @HttpCode(HttpStatus.CREATED)
  @AuditLog({
    action: 'ASSESSMENT_ADMINISTRATION_CREATE',
    resourceType: 'AssessmentAdministration',
  })
  @ApiOperation({
    summary: 'Assign a clinical psychometric instrument to a patient',
  })
  @ApiCreatedResponse({
    description: 'Assessment administered and assigned successfully',
  })
  @ApiNotFoundResponse({
    description: 'Patient, Branch, CaseFile or InstrumentVersion not found',
  })
  assign(
    @CurrentTenant(true) tenant: TenantContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AssignAssessmentDto,
  ) {
    return this.assessmentsService.assign(tenant.organizationId, user.id, dto);
  }

  @ApiBearerAuth('bearer')
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  @ApiForbiddenResponse({ description: 'Forbidden tenant access' })
  @ApiHeader({
    name: 'X-Organization-Id',
    required: false,
    description: 'Optional UUID selection hint for tenant context.',
  })
  @Get('administrations')
  @ApiOperation({
    summary:
      'List assessment administrations with filters (patient, professional, status, instrument, dates)',
  })
  @ApiOkResponse({
    description: 'Filtered list of assessment administrations returned',
  })
  findAll(
    @CurrentTenant(true) tenant: TenantContext,
    @Query() query: QueryAdministrationsDto,
  ) {
    return this.assessmentsService.findAll(tenant.organizationId, query);
  }

  @ApiBearerAuth('bearer')
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  @ApiForbiddenResponse({ description: 'Forbidden tenant access' })
  @ApiHeader({
    name: 'X-Organization-Id',
    required: false,
    description: 'Optional UUID selection hint for tenant context.',
  })
  @Get('administrations/:id')
  @ApiOperation({
    summary:
      'Get detailed assessment administration state, instrument definition, responses and results',
  })
  @ApiParam({ name: 'id', description: 'Assessment administration UUID' })
  @ApiOkResponse({ description: 'Assessment administration details retrieved' })
  @ApiNotFoundResponse({
    description: 'Assessment administration not found in tenant',
  })
  findOne(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.assessmentsService.findOne(tenant.organizationId, id);
  }

  @ApiBearerAuth('bearer')
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  @ApiForbiddenResponse({ description: 'Forbidden tenant access' })
  @ApiHeader({
    name: 'X-Organization-Id',
    required: false,
    description: 'Optional UUID selection hint for tenant context.',
  })
  @Patch('administrations/:id/responses')
  @HttpCode(HttpStatus.OK)
  @AuditLog({
    action: 'ASSESSMENT_RESPONSES_SAVE',
    resourceType: 'AssessmentAdministration',
  })
  @ApiOperation({
    summary:
      'Progressive auto-save of item responses (transitions to IN_PROGRESS)',
  })
  @ApiParam({ name: 'id', description: 'Assessment administration UUID' })
  @ApiOkResponse({ description: 'Responses saved and progress updated' })
  @ApiNotFoundResponse({ description: 'Assessment administration not found' })
  @ApiConflictResponse({
    description:
      'Assessment is already completed, cancelled or expired (immutability locked)',
  })
  saveResponses(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveResponsesDto,
  ) {
    return this.assessmentsService.saveResponses(
      tenant.organizationId,
      id,
      dto,
    );
  }

  @ApiBearerAuth('bearer')
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  @ApiForbiddenResponse({ description: 'Forbidden tenant access' })
  @ApiHeader({
    name: 'X-Organization-Id',
    required: false,
    description: 'Optional UUID selection hint for tenant context.',
  })
  @Post('administrations/:id/complete')
  @HttpCode(HttpStatus.OK)
  @AuditLog({
    action: 'ASSESSMENT_COMPLETED',
    resourceType: 'AssessmentAdministration',
  })
  @ApiOperation({
    summary:
      'Finalize assessment, calculate deterministic score via Scoring Engine, persist result and lock permanently',
  })
  @ApiParam({ name: 'id', description: 'Assessment administration UUID' })
  @ApiOkResponse({
    description: 'Assessment finalized and result calculated/persisted',
  })
  @ApiNotFoundResponse({ description: 'Assessment administration not found' })
  @ApiConflictResponse({
    description:
      'Assessment is already completed (ASSESSMENT_ALREADY_COMPLETED)',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'Assessment is incomplete. Missing required items for psychometric scoring.',
  })
  complete(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.assessmentsService.complete(tenant.organizationId, id);
  }

  @Public()
  @Get('public/runner/:accessToken')
  @ApiOperation({
    summary:
      'Public remote runner endpoint to load assessment for patient by access token',
  })
  @ApiParam({
    name: 'accessToken',
    description: 'Unique evaluation access token',
  })
  @ApiOkResponse({
    description: 'Assessment definition and previous responses retrieved',
  })
  @ApiNotFoundResponse({
    description: 'Assessment runner link invalid or not found',
  })
  @ApiConflictResponse({ description: 'Assessment link has expired' })
  findPublicRunner(@Param('accessToken') accessToken: string) {
    return this.assessmentsService.findByAccessToken(accessToken);
  }

  @Public()
  @Patch('public/runner/:accessToken/responses')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Public progressive auto-save of patient responses by access token',
  })
  @ApiParam({
    name: 'accessToken',
    description: 'Unique evaluation access token',
  })
  @ApiOkResponse({ description: 'Responses saved successfully' })
  @ApiNotFoundResponse({
    description: 'Assessment runner link invalid or not found',
  })
  @ApiConflictResponse({
    description: 'Assessment is locked (completed, cancelled or expired)',
  })
  savePublicResponses(
    @Param('accessToken') accessToken: string,
    @Body() dto: SaveResponsesDto,
  ) {
    return this.assessmentsService.saveResponsesByAccessToken(accessToken, dto);
  }

  @Public()
  @Post('public/runner/:accessToken/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Finalize evaluation from public runner by access token, calculate score and generate result',
  })
  @ApiParam({
    name: 'accessToken',
    description: 'Unique evaluation access token',
  })
  @ApiBody({
    type: SaveResponsesDto,
    required: false,
    description:
      'Optional responses snapshot to save atomically before calculating score',
  })
  @ApiOkResponse({
    description: 'Assessment completed and deterministic score calculated',
  })
  @ApiNotFoundResponse({
    description: 'Assessment runner link invalid or not found',
  })
  @ApiConflictResponse({
    description:
      'Assessment is already completed (ASSESSMENT_ALREADY_COMPLETED)',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'Assessment is incomplete. Missing required items for psychometric scoring.',
  })
  completePublic(
    @Param('accessToken') accessToken: string,
    @Body() dto?: SaveResponsesDto,
  ) {
    return this.assessmentsService.completeByAccessToken(accessToken, dto);
  }

  @ApiBearerAuth('bearer')
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  @ApiForbiddenResponse({ description: 'Forbidden tenant access' })
  @ApiHeader({
    name: 'X-Organization-Id',
    required: false,
    description: 'Optional UUID selection hint for tenant context.',
  })
  @Get('administrations/:id/report')
  @ApiOperation({
    summary:
      'Generate full structured psychometric clinical report (NOM-004-SSA3-2012 / ITC compliant)',
  })
  @ApiParam({ name: 'id', description: 'Assessment administration UUID' })
  @ApiOkResponse({
    description:
      'Structured clinical psychometric report generated successfully',
  })
  @ApiNotFoundResponse({
    description: 'Assessment administration not found in tenant',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'Assessment has not been completed yet — report requires finalized evaluation',
  })
  getReport(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.assessmentsService.getReport(tenant.organizationId, id);
  }

  @ApiBearerAuth('bearer')
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  @ApiForbiddenResponse({ description: 'Forbidden tenant access' })
  @ApiHeader({
    name: 'X-Organization-Id',
    required: false,
    description: 'Optional UUID selection hint for tenant context.',
  })
  @Get('patients/:patientId/longitudinal')
  @ApiOperation({
    summary:
      'Get longitudinal psychometric time series for a patient with clinical delta analysis',
  })
  @ApiParam({
    name: 'patientId',
    description: 'Patient UUID to retrieve longitudinal assessment series',
  })
  @ApiOkResponse({
    description:
      'Longitudinal psychometric series with MCiD deltas and trend summary returned',
  })
  @ApiNotFoundResponse({ description: 'Patient not found in tenant' })
  getLongitudinal(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Query() query: QueryLongitudinalDto,
  ) {
    return this.assessmentsService.getLongitudinalSeries(
      tenant.organizationId,
      patientId,
      query,
    );
  }
}
