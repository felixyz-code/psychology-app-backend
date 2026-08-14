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
  UseGuards,
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
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { OrganizationStatus } from '@prisma/client';
import { AuditLog } from '../../../audit-logs/decorators/audit-log.decorator';
import { AllowedOrganizationStatuses } from '../../../tenant-context/decorators/allowed-organization-statuses.decorator';
import { CurrentTenant } from '../../../tenant-context/decorators/current-tenant.decorator';
import { TenantRequired } from '../../../tenant-context/decorators/tenant-required.decorator';
import type { TenantContext } from '../../../tenant-context/tenant-context.types';
import { BranchesService } from './branches.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { AssignUserBranchDto } from './dto/assign-user-branch.dto';

@ApiTags('enterprise-branches')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Authentication is required' })
@ApiForbiddenResponse({
  description: 'Forbidden tenant access or quota exceeded',
})
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
@Controller('enterprise/branches')
export class BranchesController {
  constructor(private readonly branchesService: BranchesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @AuditLog({ action: 'BRANCH_CREATE', resourceType: 'Branch' })
  @ApiOperation({
    summary: 'Create a new branch for the organization',
    description:
      'Checks plan quota (MAX_BRANCHES) and branch code uniqueness. Requires organization management privileges.',
  })
  @ApiCreatedResponse({ description: 'Branch successfully created' })
  @ApiConflictResponse({
    description: 'Branch code already exists (BRANCH_CODE_EXISTS)',
  })
  @ApiForbiddenResponse({
    description: 'Plan limit exceeded (PLAN_LIMIT_EXCEEDED)',
  })
  create(
    @CurrentTenant(true) tenant: TenantContext,
    @Body() dto: CreateBranchDto,
  ) {
    return this.branchesService.create(tenant.organizationId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all branches of the current organization' })
  @ApiQuery({
    name: 'includeInactive',
    required: false,
    type: Boolean,
    description: 'Whether to include inactive branches in listing',
  })
  @ApiOkResponse({ description: 'List of branches returned successfully' })
  findAll(
    @CurrentTenant(true) tenant: TenantContext,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.branchesService.findAll(tenant.organizationId, {
      includeInactive: includeInactive === 'true',
    });
  }

  @Get('me/accesses')
  @ApiOperation({
    summary: 'Get branch assignments for the current authenticated user',
  })
  @ApiOkResponse({ description: 'User branch assignments retrieved' })
  getMyBranches(@CurrentTenant(true) tenant: TenantContext) {
    return this.branchesService.getUserBranches(
      tenant.organizationId,
      tenant.userId,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get branch details by ID' })
  @ApiParam({ name: 'id', description: 'Branch UUID' })
  @ApiOkResponse({ description: 'Branch details retrieved' })
  @ApiNotFoundResponse({ description: 'Branch not found' })
  findOne(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.branchesService.findOne(tenant.organizationId, id);
  }

  @Patch(':id')
  @AuditLog({ action: 'BRANCH_UPDATE', resourceType: 'Branch' })
  @ApiOperation({ summary: 'Update branch details' })
  @ApiParam({ name: 'id', description: 'Branch UUID' })
  @ApiOkResponse({ description: 'Branch updated successfully' })
  @ApiConflictResponse({
    description: 'Branch code conflict (BRANCH_CODE_EXISTS)',
  })
  @ApiNotFoundResponse({ description: 'Branch not found' })
  update(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.branchesService.update(tenant.organizationId, id, dto);
  }

  @Delete(':id')
  @AuditLog({ action: 'BRANCH_DELETE', resourceType: 'Branch' })
  @ApiOperation({ summary: 'Soft delete a branch' })
  @ApiParam({ name: 'id', description: 'Branch UUID' })
  @ApiOkResponse({ description: 'Branch soft-deleted successfully' })
  @ApiForbiddenResponse({
    description: 'Cannot delete only active branch (CANNOT_DELETE_ONLY_BRANCH)',
  })
  @ApiNotFoundResponse({ description: 'Branch not found' })
  remove(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.branchesService.remove(tenant.organizationId, id);
  }

  @Post(':id/users')
  @AuditLog({ action: 'BRANCH_USER_ASSIGN', resourceType: 'UserBranchAccess' })
  @ApiOperation({ summary: 'Assign a user to a branch' })
  @ApiParam({ name: 'id', description: 'Branch UUID' })
  @ApiOkResponse({ description: 'User successfully assigned to branch' })
  @ApiNotFoundResponse({ description: 'Branch or user membership not found' })
  assignUser(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('id', ParseUUIDPipe) branchId: string,
    @Body() dto: AssignUserBranchDto,
  ) {
    return this.branchesService.assignUser(tenant.organizationId, {
      ...dto,
      branchId,
    });
  }

  @Delete(':id/users/:userId')
  @AuditLog({
    action: 'BRANCH_USER_UNASSIGN',
    resourceType: 'UserBranchAccess',
  })
  @ApiOperation({ summary: 'Remove user access from a branch' })
  @ApiParam({ name: 'id', description: 'Branch UUID' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiOkResponse({ description: 'User branch access removed' })
  @ApiNotFoundResponse({ description: 'Branch or access assignment not found' })
  removeUserAccess(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('id', ParseUUIDPipe) branchId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.branchesService.removeUserAccess(
      tenant.organizationId,
      branchId,
      userId,
    );
  }

  @Get(':id/users')
  @ApiOperation({ summary: 'List all users assigned to a branch' })
  @ApiParam({ name: 'id', description: 'Branch UUID' })
  @ApiOkResponse({ description: 'List of assigned users' })
  @ApiNotFoundResponse({ description: 'Branch not found' })
  getBranchUsers(
    @CurrentTenant(true) tenant: TenantContext,
    @Param('id', ParseUUIDPipe) branchId: string,
  ) {
    return this.branchesService.getBranchUsers(tenant.organizationId, branchId);
  }
}
