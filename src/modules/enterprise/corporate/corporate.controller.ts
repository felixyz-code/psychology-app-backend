import {
  Body,
  Controller,
  Delete,
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
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  OrganizationStatus,
  PaefAgreementStatus,
  BenefitDebitStatus,
} from '@prisma/client';
import { AuditLog } from '../../../audit-logs/decorators/audit-log.decorator';
import { AllowedOrganizationStatuses } from '../../../tenant-context/decorators/allowed-organization-statuses.decorator';
import { CurrentTenant } from '../../../tenant-context/decorators/current-tenant.decorator';
import { TenantRequired } from '../../../tenant-context/decorators/tenant-required.decorator';
import type { TenantContext } from '../../../tenant-context/tenant-context.types';
import { CorporateClientsService } from './services/corporate-clients.service';
import { PaefAgreementsService } from './services/paef-agreements.service';
import { BenefitPoolsService } from './services/benefit-pools.service';
import { EmployeeEligibilityService } from './services/employee-eligibility.service';
import { BenefitDebitService } from './services/benefit-debit.service';
import type { Response } from 'express';
import { Res } from '@nestjs/common';
import { CorporateReportingService } from './services/corporate-reporting.service';
import {
  CorporateBillingStatementQueryDto,
  CorporateReportQueryDto,
} from './dto/corporate-report-query.dto';
import { CreateCorporateClientDto } from './dto/create-corporate-client.dto';
import { UpdateCorporateClientDto } from './dto/update-corporate-client.dto';
import { CreatePaefAgreementDto } from './dto/create-paef-agreement.dto';
import { UpdatePaefAgreementDto } from './dto/update-paef-agreement.dto';
import { CreateBenefitPoolDto } from './dto/create-benefit-pool.dto';
import { UpdateBenefitPoolDto } from './dto/update-benefit-pool.dto';
import { CreateEmployeeEligibilityDto } from './dto/create-employee-eligibility.dto';
import { BatchEmployeeEligibilityDto } from './dto/batch-employee-eligibility.dto';
import { UpdateEmployeeEligibilityDto } from './dto/update-employee-eligibility.dto';
import {
  CheckEligibilityDto,
  ConfirmBenefitSessionDto,
  ReleaseBenefitSessionDto,
  ReserveBenefitSessionDto,
} from './dto/benefit-debit.dto';

@ApiTags('enterprise-corporate-agreements')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Authentication is required' })
@ApiForbiddenResponse({
  description: 'Forbidden tenant access or insufficient privileges',
})
@ApiHeader({
  name: 'X-Organization-Id',
  required: false,
  description: 'Optional UUID selection hint for tenant context.',
})
@ApiHeader({
  name: 'X-Branch-Id',
  required: false,
  description: 'Optional branch UUID for multi-branch scoped operations.',
})
@TenantRequired()
@AllowedOrganizationStatuses(
  OrganizationStatus.ACTIVE,
  OrganizationStatus.PROVISIONING,
)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@Controller('enterprise/corporate')
export class CorporateController {
  constructor(
    private readonly clientsService: CorporateClientsService,
    private readonly agreementsService: PaefAgreementsService,
    private readonly poolsService: BenefitPoolsService,
    private readonly eligibilityService: EmployeeEligibilityService,
    private readonly debitService: BenefitDebitService,
    private readonly reportingService: CorporateReportingService,
  ) {}

  // ==================== CORPORATE CLIENTS ====================

  @Post('clients')
  @HttpCode(HttpStatus.CREATED)
  @AuditLog({
    action: 'CORPORATE_CLIENT_CREATE',
    resourceType: 'CorporateClient',
  })
  @ApiOperation({ summary: 'Create a new corporate client company' })
  @ApiCreatedResponse({ description: 'Corporate client successfully created' })
  @ApiConflictResponse({ description: 'Corporate client name already exists' })
  createClient(
    @CurrentTenant(true) tenant: TenantContext,
    @Body() dto: CreateCorporateClientDto,
  ) {
    return this.clientsService.create(tenant.organizationId, dto);
  }

  @Get('clients')
  @ApiOperation({ summary: 'List all corporate clients for the organization' })
  @ApiQuery({
    name: 'includeInactive',
    required: false,
    type: Boolean,
  })
  findAllClients(
    @CurrentTenant(true) tenant: TenantContext,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.clientsService.findAll(tenant.organizationId, {
      includeInactive: includeInactive === 'true',
    });
  }

  @Get('clients/:id')
  @ApiOperation({
    summary: 'Get corporate client details and active agreements',
  })
  @ApiParam({ name: 'id', description: 'Corporate client UUID' })
  findClient(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.clientsService.findOne(tenant.organizationId, id);
  }

  @Patch('clients/:id')
  @AuditLog({
    action: 'CORPORATE_CLIENT_UPDATE',
    resourceType: 'CorporateClient',
  })
  @ApiOperation({ summary: 'Update corporate client information' })
  @ApiParam({ name: 'id', description: 'Corporate client UUID' })
  updateClient(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCorporateClientDto,
  ) {
    return this.clientsService.update(tenant.organizationId, id, dto);
  }

  @Delete('clients/:id')
  @AuditLog({
    action: 'CORPORATE_CLIENT_DEACTIVATE',
    resourceType: 'CorporateClient',
  })
  @ApiOperation({ summary: 'Deactivate a corporate client' })
  @ApiParam({ name: 'id', description: 'Corporate client UUID' })
  removeClient(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.clientsService.remove(tenant.organizationId, id);
  }

  // ==================== PAEF AGREEMENTS ====================

  @Post('agreements')
  @HttpCode(HttpStatus.CREATED)
  @AuditLog({ action: 'PAEF_AGREEMENT_CREATE', resourceType: 'PaefAgreement' })
  @ApiOperation({ summary: 'Create a new PAEF Corporate Agreement contract' })
  @ApiCreatedResponse({ description: 'PAEF agreement created successfully' })
  createAgreement(
    @CurrentTenant(true) tenant: TenantContext,
    @Body() dto: CreatePaefAgreementDto,
  ) {
    return this.agreementsService.create(tenant.organizationId, dto);
  }

  @Get('agreements')
  @ApiOperation({ summary: 'List all PAEF agreements with summary counters' })
  @ApiQuery({ name: 'corporateClientId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: PaefAgreementStatus })
  findAllAgreements(
    @CurrentTenant(true) tenant: TenantContext,
    @Query('corporateClientId') corporateClientId?: string,
    @Query('status') status?: PaefAgreementStatus,
  ) {
    return this.agreementsService.findAll(tenant.organizationId, {
      corporateClientId,
      status,
    });
  }

  @Get('agreements/:id')
  @ApiOperation({ summary: 'Get agreement details, pools and employee roster' })
  @ApiParam({ name: 'id', description: 'Agreement UUID' })
  findAgreement(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.agreementsService.findOne(tenant.organizationId, id);
  }

  @Patch('agreements/:id')
  @AuditLog({ action: 'PAEF_AGREEMENT_UPDATE', resourceType: 'PaefAgreement' })
  @ApiOperation({ summary: 'Update PAEF agreement properties' })
  @ApiParam({ name: 'id', description: 'Agreement UUID' })
  updateAgreement(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaefAgreementDto,
  ) {
    return this.agreementsService.update(tenant.organizationId, id, dto);
  }

  @Delete('agreements/:id')
  @AuditLog({
    action: 'PAEF_AGREEMENT_TERMINATE',
    resourceType: 'PaefAgreement',
  })
  @ApiOperation({ summary: 'Terminate a PAEF agreement' })
  @ApiParam({ name: 'id', description: 'Agreement UUID' })
  removeAgreement(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.agreementsService.remove(tenant.organizationId, id);
  }

  // ==================== BENEFIT POOLS ====================

  @Post('agreements/:agreementId/pools')
  @HttpCode(HttpStatus.CREATED)
  @AuditLog({ action: 'BENEFIT_POOL_CREATE', resourceType: 'BenefitPool' })
  @ApiOperation({
    summary: 'Allocate a new session benefit pool under an agreement',
  })
  @ApiParam({ name: 'agreementId', description: 'Agreement UUID' })
  createPool(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('agreementId', ParseUUIDPipe) agreementId: string,
    @Body() dto: CreateBenefitPoolDto,
  ) {
    return this.poolsService.create(tenant.organizationId, agreementId, dto);
  }

  @Get('agreements/:agreementId/pools')
  @ApiOperation({
    summary: 'List all benefit pools for an agreement with real-time balances',
  })
  @ApiParam({ name: 'agreementId', description: 'Agreement UUID' })
  findAllPools(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('agreementId', ParseUUIDPipe) agreementId: string,
  ) {
    return this.poolsService.findAllByAgreement(
      tenant.organizationId,
      agreementId,
    );
  }

  @Get('pools/:poolId')
  @ApiOperation({ summary: 'Get detailed benefit pool metrics' })
  @ApiParam({ name: 'poolId', description: 'Benefit pool UUID' })
  findPool(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('poolId', ParseUUIDPipe) poolId: string,
  ) {
    return this.poolsService.findOne(tenant.organizationId, poolId);
  }

  @Patch('pools/:poolId')
  @AuditLog({ action: 'BENEFIT_POOL_UPDATE', resourceType: 'BenefitPool' })
  @ApiOperation({ summary: 'Update benefit pool quota or validity' })
  @ApiParam({ name: 'poolId', description: 'Benefit pool UUID' })
  updatePool(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('poolId', ParseUUIDPipe) poolId: string,
    @Body() dto: UpdateBenefitPoolDto,
  ) {
    return this.poolsService.update(tenant.organizationId, poolId, dto);
  }

  // ==================== EMPLOYEE ELIGIBILITY ====================

  @Post('agreements/:agreementId/eligibility')
  @HttpCode(HttpStatus.CREATED)
  @AuditLog({
    action: 'EMPLOYEE_ELIGIBILITY_CREATE',
    resourceType: 'EmployeeEligibility',
  })
  @ApiOperation({
    summary: 'Add a single employee to agreement eligibility roster',
  })
  @ApiParam({ name: 'agreementId', description: 'Agreement UUID' })
  createEligibility(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('agreementId', ParseUUIDPipe) agreementId: string,
    @Body() dto: CreateEmployeeEligibilityDto,
  ) {
    return this.eligibilityService.create(
      tenant.organizationId,
      agreementId,
      dto,
    );
  }

  @Post('agreements/:agreementId/eligibility/batch')
  @HttpCode(HttpStatus.OK)
  @AuditLog({
    action: 'EMPLOYEE_ELIGIBILITY_BATCH',
    resourceType: 'EmployeeEligibility',
  })
  @ApiOperation({
    summary: 'Batch import employee eligibility roster from CSV/JSON',
  })
  @ApiParam({ name: 'agreementId', description: 'Agreement UUID' })
  batchCreateEligibility(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('agreementId', ParseUUIDPipe) agreementId: string,
    @Body() dto: BatchEmployeeEligibilityDto,
  ) {
    return this.eligibilityService.batchCreate(
      tenant.organizationId,
      agreementId,
      dto,
    );
  }

  @Get('agreements/:agreementId/eligibility')
  @ApiOperation({ summary: 'List employees in agreement eligibility roster' })
  @ApiParam({ name: 'agreementId', description: 'Agreement UUID' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'department', required: false })
  findAllEligibility(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('agreementId', ParseUUIDPipe) agreementId: string,
    @Query('search') search?: string,
    @Query('department') department?: string,
  ) {
    return this.eligibilityService.findAllByAgreement(
      tenant.organizationId,
      agreementId,
      { search, department },
    );
  }

  @Get('eligibility/:id')
  @ApiOperation({ summary: 'Get employee eligibility details and history' })
  @ApiParam({ name: 'id', description: 'Eligibility UUID' })
  findEligibility(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.eligibilityService.findOne(tenant.organizationId, id);
  }

  @Patch('eligibility/:id')
  @AuditLog({
    action: 'EMPLOYEE_ELIGIBILITY_UPDATE',
    resourceType: 'EmployeeEligibility',
  })
  @ApiOperation({ summary: 'Update employee quota, department or status' })
  @ApiParam({ name: 'id', description: 'Eligibility UUID' })
  updateEligibility(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmployeeEligibilityDto,
  ) {
    return this.eligibilityService.update(tenant.organizationId, id, dto);
  }

  @Delete('eligibility/:id')
  @AuditLog({
    action: 'EMPLOYEE_ELIGIBILITY_REVOKE',
    resourceType: 'EmployeeEligibility',
  })
  @ApiOperation({
    summary: 'Revoke employee eligibility for corporate coverage',
  })
  @ApiParam({ name: 'id', description: 'Eligibility UUID' })
  removeEligibility(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.eligibilityService.remove(tenant.organizationId, id);
  }

  @Post('eligibility/check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Real-time check of employee eligibility and benefit pool quota',
  })
  checkEligibility(
    @CurrentTenant(true) tenant: TenantContext,
    @Body() dto: CheckEligibilityDto,
  ) {
    return this.eligibilityService.checkEligibility(tenant.organizationId, dto);
  }

  // ==================== BENEFIT DEBIT (ACID TRANSACTIONS) ====================

  @Post('debit/reserve')
  @HttpCode(HttpStatus.CREATED)
  @AuditLog({
    action: 'BENEFIT_DEBIT_RESERVE',
    resourceType: 'BenefitDebitLog',
  })
  @ApiOperation({
    summary:
      'Atomically reserve a session from a benefit pool (ACID SELECT FOR UPDATE)',
    description:
      'Performs pessimistic row-level locking on the benefit pool and employee quota to prevent race conditions and overdrafts.',
  })
  reserveSession(
    @CurrentTenant(true) tenant: TenantContext,
    @Body() dto: ReserveBenefitSessionDto,
  ) {
    return this.debitService.reserveBenefitSession(
      tenant.organizationId,
      dto,
      tenant.userId,
    );
  }

  @Post('debit/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @AuditLog({
    action: 'BENEFIT_DEBIT_CONFIRM',
    resourceType: 'BenefitDebitLog',
  })
  @ApiOperation({
    summary: 'Confirm a reserved benefit session upon completion',
  })
  @ApiParam({ name: 'id', description: 'Benefit debit log UUID' })
  confirmSession(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmBenefitSessionDto,
  ) {
    return this.debitService.confirmBenefitSession(
      tenant.organizationId,
      id,
      dto,
      tenant.userId,
    );
  }

  @Post('debit/:id/release')
  @HttpCode(HttpStatus.OK)
  @AuditLog({
    action: 'BENEFIT_DEBIT_RELEASE',
    resourceType: 'BenefitDebitLog',
  })
  @ApiOperation({
    summary: 'Release a reserved session or refund a confirmed session',
  })
  @ApiParam({ name: 'id', description: 'Benefit debit log UUID' })
  releaseSession(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReleaseBenefitSessionDto,
  ) {
    return this.debitService.releaseOrRefundBenefitSession(
      tenant.organizationId,
      id,
      dto,
      tenant.userId,
    );
  }

  @Get('debit/logs')
  @ApiOperation({ summary: 'Query the immutable benefit debit ledger' })
  @ApiQuery({ name: 'agreementId', required: false })
  @ApiQuery({ name: 'poolId', required: false })
  @ApiQuery({ name: 'eligibilityId', required: false })
  @ApiQuery({ name: 'appointmentId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: BenefitDebitStatus })
  getDebitLogs(
    @CurrentTenant(true) tenant: TenantContext,
    @Query('agreementId') agreementId?: string,
    @Query('poolId') poolId?: string,
    @Query('eligibilityId') eligibilityId?: string,
    @Query('appointmentId') appointmentId?: string,
    @Query('status') status?: BenefitDebitStatus,
  ) {
    return this.debitService.getDebitLogs(tenant.organizationId, {
      agreementId,
      poolId,
      eligibilityId,
      appointmentId,
      status,
    });
  }

  // ==================== EXECUTIVE REPORTING & BILLING RECONCILIATION ====================

  @Get('agreements/:id/reports/executive')
  @AuditLog({
    action: 'CORPORATE_EXECUTIVE_REPORT_READ',
    resourceType: 'PaefAgreement',
  })
  @ApiOperation({
    summary:
      'Get aggregated executive PAEF report with Zero ePHI Leakage and k-anonymity (k >= 5)',
    description:
      'Compiles pool utilization rates, coverage KPIs, and anonymous departmental breakdown adhering strictly to NOM-004 / HIPAA privacy rules.',
  })
  @ApiParam({ name: 'id', description: 'PAEF agreement UUID' })
  getExecutiveReport(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CorporateReportQueryDto,
  ) {
    return this.reportingService.getExecutiveReport(
      tenant.organizationId,
      id,
      query,
    );
  }

  @Get('agreements/:id/reports/billing-statement')
  @AuditLog({
    action: 'CORPORATE_BILLING_STATEMENT_READ',
    resourceType: 'PaefAgreement',
  })
  @ApiOperation({
    summary: 'Get monthly billing reconciliation statement for PAEF agreement',
    description:
      'Calculates confirmed sessions, subtotal, IVA, and anonymized debit audit ledger for corporate invoicing.',
  })
  @ApiParam({ name: 'id', description: 'PAEF agreement UUID' })
  getBillingStatement(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CorporateBillingStatementQueryDto,
  ) {
    return this.reportingService.getBillingStatement(
      tenant.organizationId,
      id,
      query,
    );
  }

  @Get('agreements/:id/reports/export/csv')
  @AuditLog({
    action: 'CORPORATE_BILLING_CSV_EXPORT',
    resourceType: 'PaefAgreement',
  })
  @ApiOperation({
    summary: 'Export monthly billing reconciliation statement as UTF-8 BOM CSV',
    description:
      'Generates a UTF-8 BOM CSV file containing financial reconciliation and anonymized debit ledger ready for ERP / Excel.',
  })
  @ApiParam({ name: 'id', description: 'PAEF agreement UUID' })
  async exportBillingCsv(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CorporateBillingStatementQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const csvContent = await this.reportingService.exportBillingCsv(
      tenant.organizationId,
      id,
      query,
    );

    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="paef-billing-${encodeURIComponent(id)}-${Date.now()}.csv"`,
    );

    return csvContent;
  }
}
