import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiBody,
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
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuditLog } from '../audit-logs/decorators/audit-log.decorator';
import { AuditSeverity } from '../audit-logs/audit-logs.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CurrentTenant } from '../tenant-context/decorators/current-tenant.decorator';
import { TenantRequired } from '../tenant-context/decorators/tenant-required.decorator';
import type { TenantContext } from '../tenant-context/tenant-context.types';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { TransferPatientBranchDto } from './dto/transfer-patient-branch.dto';
import { PatientResponseDto } from './dto/patient-response.dto';
import { PatientsService } from './patients.service';
import type { PatientAccessScope } from './types/patient-access-scope.type';

@ApiTags('patients')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({
  description: 'Missing, invalid, or expired Bearer JWT',
})
@ApiHeader({
  name: 'X-Organization-Id',
  required: false,
  description:
    'Optional UUID selection hint. A tenant-required route resolves the only eligible membership when it is omitted.',
})
@ApiHeader({
  name: 'X-Branch-Id',
  required: false,
  description: 'Optional UUID selection hint for branch context isolation.',
})
@ApiForbiddenResponse({
  description: 'Authenticated user lacks a permitted role',
})
@TenantRequired()
@Controller('patients')
@Roles(UserRole.ADMIN, UserRole.PSYCHOLOGIST)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
  }),
)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Post()
  @AuditLog({ action: 'CLINICAL_PATIENT_MUTATION', resourceType: 'Patient' })
  @ApiOperation({ summary: 'Create a patient' })
  @ApiBody({ type: CreatePatientDto })
  @ApiCreatedResponse({
    description: 'Patient created successfully',
    type: PatientResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid patient payload' })
  create(
    @Body() createPatientDto: CreatePatientDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
    @Headers('x-branch-id') branchId?: string,
  ) {
    return this.patientsService.create(
      createPatientDto,
      this.createScope(tenant, user, branchId),
    );
  }

  @Get()
  @AuditLog({ action: 'CLINICAL_PATIENT_READ', resourceType: 'Patient' })
  @ApiOperation({ summary: 'List all patients' })
  @ApiOkResponse({
    description: 'Patients retrieved successfully',
    type: PatientResponseDto,
    isArray: true,
  })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
    @Headers('x-branch-id') branchId?: string,
  ) {
    return this.patientsService.findAll(
      this.createScope(tenant, user, branchId),
    );
  }

  @Get(':id')
  @AuditLog({ action: 'CLINICAL_PATIENT_READ', resourceType: 'Patient' })
  @ApiOperation({ summary: 'Get a patient by ID' })
  @ApiParam({
    name: 'id',
    description: 'Patient ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Patient retrieved successfully',
    type: PatientResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid patient ID' })
  @ApiNotFoundResponse({ description: 'Patient not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
    @Headers('x-branch-id') branchId?: string,
  ) {
    return this.patientsService.findOne(
      id,
      this.createScope(tenant, user, branchId),
    );
  }

  @Post(':id/transfer')
  @AuditLog({
    action: 'PATIENT_BRANCH_TRANSFER',
    resourceType: 'Patient',
    severity: AuditSeverity.HIGH,
  })
  @ApiOperation({
    summary: 'Transfer patient to a different branch with reassignment',
    description:
      'Transfers a patient to another branch in the same organization, reassigning active clinical primary assignments to a psychologist with access to the destination branch.',
  })
  @ApiParam({
    name: 'id',
    description: 'Patient UUID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({ type: TransferPatientBranchDto })
  @ApiOkResponse({
    description: 'Patient transferred successfully',
    type: PatientResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Invalid transfer payload or psychologist not assigned to target branch',
  })
  @ApiNotFoundResponse({
    description: 'Patient, target branch or target psychologist not found',
  })
  transfer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() transferDto: TransferPatientBranchDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.patientsService.transferBranch(
      id,
      transferDto,
      this.createScope(tenant, user),
    );
  }

  @Patch(':id')
  @AuditLog({ action: 'CLINICAL_PATIENT_MUTATION', resourceType: 'Patient' })
  @ApiOperation({ summary: 'Update a patient' })
  @ApiParam({
    name: 'id',
    description: 'Patient ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({ type: UpdatePatientDto })
  @ApiOkResponse({
    description: 'Patient updated successfully',
    type: PatientResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid patient payload or ID' })
  @ApiNotFoundResponse({ description: 'Patient not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updatePatientDto: UpdatePatientDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.patientsService.update(
      id,
      updatePatientDto,
      this.createScope(tenant, user),
    );
  }

  @Delete(':id')
  @AuditLog({ action: 'CLINICAL_PATIENT_MUTATION', resourceType: 'Patient' })
  @ApiOperation({ summary: 'Delete a patient' })
  @ApiParam({
    name: 'id',
    description: 'Patient ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Patient deleted successfully',
    type: PatientResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid patient ID' })
  @ApiNotFoundResponse({ description: 'Patient not found' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.patientsService.remove(id, this.createScope(tenant, user));
  }

  private createScope(
    tenant: TenantContext,
    user: AuthenticatedUser,
    branchId?: string,
  ): PatientAccessScope {
    return {
      organizationId: tenant.organizationId,
      membershipId: tenant.membershipId,
      organizationRole: tenant.organizationRole,
      userId: user.id,
      legacyUserRole: tenant.legacyUserRole,
      resolutionMode: tenant.resolutionMode,
      branchId:
        branchId && branchId !== 'ALL' && branchId.trim() !== ''
          ? branchId.trim()
          : undefined,
    };
  }
}
