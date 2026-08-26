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
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuditLog } from '../../audit-logs/decorators/audit-log.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SkipTenantContext } from '../../tenant-context/decorators/skip-tenant-context.decorator';
import { AdminTenantsService } from '../services/admin-tenants.service';
import {
  AdminTenantListItemDto,
  ExtendTenantTrialDto,
  FreezeTenantDto,
  GrantLifetimeSponsorDto,
  UpdateTenantQuotasDto,
} from '../dto/admin-tenants.dto';

@ApiTags('admin-tenants')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Authentication is required' })
@ApiForbiddenResponse({ description: 'ADMIN role is required' })
@SkipTenantContext()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@Controller('admin/tenants')
export class AdminTenantsController {
  constructor(private readonly adminTenantsService: AdminTenantsService) {}

  @Get()
  @ApiOperation({
    summary: 'List consolidated organizations, subscriptions and quotas',
    description:
      'Strictly requires global ADMIN role. Bypasses tenant context. Lists organizations with plan, usage, and sponsorship metadata.',
  })
  @ApiOkResponse({
    description: 'Consolidated list of organizations and subscription states',
    type: [AdminTenantListItemDto],
  })
  listTenants() {
    return this.adminTenantsService.listTenants();
  }

  @Post(':id/extend-trial')
  @HttpCode(HttpStatus.OK)
  @AuditLog({
    action: 'SUPERADMIN_TENANT_EXTEND_TRIAL',
    resourceType: 'Organization',
  })
  @ApiOperation({
    summary: 'Extend the trial period for a tenant',
    description:
      'Strictly requires global ADMIN role. Extends trial period by specified days.',
  })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiOkResponse({
    description: 'Trial duration successfully extended',
  })
  extendTrial(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body() dto: ExtendTenantTrialDto,
  ) {
    return this.adminTenantsService.extendTrial(organizationId, dto);
  }

  @Post(':id/grant-lifetime')
  @HttpCode(HttpStatus.OK)
  @AuditLog({
    action: 'SUPERADMIN_TENANT_GRANT_LIFETIME',
    resourceType: 'Organization',
  })
  @ApiOperation({
    summary: 'Grant lifetime sponsorship membership to an organization',
    description:
      'Strictly requires global ADMIN role. Sets status to LIFETIME_SPONSOR with isExempt=true.',
  })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiOkResponse({
    description: 'Lifetime sponsor membership successfully assigned',
  })
  grantLifetime(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body() dto: GrantLifetimeSponsorDto,
  ) {
    return this.adminTenantsService.grantLifetime(organizationId, dto);
  }

  @Patch(':id/quotas')
  @HttpCode(HttpStatus.OK)
  @AuditLog({
    action: 'SUPERADMIN_TENANT_UPDATE_QUOTAS',
    resourceType: 'Organization',
  })
  @ApiOperation({
    summary: 'Override custom quota limits for a tenant',
    description:
      'Strictly requires global ADMIN role. Manually adjusts maximum therapists, patients, and branches.',
  })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiOkResponse({
    description: 'Custom quota limits successfully updated',
  })
  updateQuotas(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body() dto: UpdateTenantQuotasDto,
  ) {
    return this.adminTenantsService.updateQuotas(organizationId, dto);
  }

  @Post(':id/freeze')
  @HttpCode(HttpStatus.OK)
  @AuditLog({
    action: 'SUPERADMIN_TENANT_FREEZE_TOGGLE',
    resourceType: 'Organization',
  })
  @ApiOperation({
    summary: 'Freeze or unfreeze tenant access',
    description:
      'Strictly requires global ADMIN role. Suspends/freezes or reactivates organization access.',
  })
  @ApiParam({ name: 'id', description: 'Organization UUID' })
  @ApiOkResponse({
    description: 'Tenant freeze state toggled successfully',
  })
  freezeTenant(
    @Param('id', ParseUUIDPipe) organizationId: string,
    @Body() dto: FreezeTenantDto,
  ) {
    return this.adminTenantsService.freezeTenant(organizationId, dto);
  }
}
