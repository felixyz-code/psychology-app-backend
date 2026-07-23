import {
  Body,
  Controller,
  Delete,
  Get,
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
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { RequireCapabilities } from '../tenant-context/authorization/require-capabilities.decorator';
import { CapabilitiesGuard } from '../tenant-context/authorization/capabilities.guard';
import { OrganizationCapability } from '../tenant-context/authorization/organization-capability';
import { CurrentTenant } from '../tenant-context/decorators/current-tenant.decorator';
import { TenantRequired } from '../tenant-context/decorators/tenant-required.decorator';
import type { TenantContext } from '../tenant-context/tenant-context.types';
import { ChangeMembershipRoleDto } from './dto/change-membership-role.dto';
import { ChangeMembershipStatusDto } from './dto/change-membership-status.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { InvitationsService } from './invitations.service';
import { MembershipsService } from './memberships.service';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Authentication is required' })
@ApiHeader({
  name: 'X-Organization-Id',
  required: false,
  description:
    'Optional UUID selection hint; server validates active membership.',
})
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly memberships: MembershipsService,
    private readonly invitations: InvitationsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List organizations accessible to the authenticated user',
  })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.organizations.findAccessible(user);
  }

  @Get('current')
  @TenantRequired()
  @UseGuards(CapabilitiesGuard)
  @RequireCapabilities(OrganizationCapability.ORGANIZATION_READ)
  @ApiOperation({ summary: 'Get the currently resolved organization' })
  current(@CurrentTenant(true) tenant: TenantContext) {
    return this.organizations.current(tenant);
  }

  @Get(':organizationId')
  @TenantRequired()
  @UseGuards(CapabilitiesGuard)
  @RequireCapabilities(OrganizationCapability.ORGANIZATION_READ)
  @ApiOperation({ summary: 'Get an accessible organization' })
  @ApiParam({
    name: 'organizationId',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiNotFoundResponse({ description: 'Organization not found' })
  findOne(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.organizations.findOne(organizationId, tenant);
  }

  @Get(':organizationId/memberships')
  @TenantRequired()
  @UseGuards(CapabilitiesGuard)
  @RequireCapabilities(OrganizationCapability.MEMBERSHIP_READ)
  @ApiOperation({ summary: 'List sanitized organization memberships' })
  membershipsList(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.memberships.findAll(organizationId, tenant);
  }

  @Patch(':organizationId/memberships/:membershipId/role')
  @TenantRequired()
  @ApiOperation({ summary: 'Change a non-owner membership role' })
  @ApiForbiddenResponse({ description: 'Membership action is not permitted' })
  @ApiConflictResponse({
    description: 'Invalid membership transition or owner invariant',
  })
  changeRole(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: ChangeMembershipRoleDto,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.memberships.changeRole(
      organizationId,
      membershipId,
      dto.role,
      tenant,
    );
  }

  @Patch(':organizationId/memberships/:membershipId/status')
  @TenantRequired()
  @ApiOperation({ summary: 'Suspend or reactivate a membership' })
  changeStatus(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: ChangeMembershipStatusDto,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.memberships.changeStatus(
      organizationId,
      membershipId,
      dto.status,
      tenant,
    );
  }

  @Delete(':organizationId/memberships/:membershipId')
  @TenantRequired()
  @ApiOperation({ summary: 'Remove a membership without deleting history' })
  remove(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.memberships.remove(organizationId, membershipId, tenant);
  }

  @Post(':organizationId/memberships/leave')
  @TenantRequired()
  @ApiOperation({ summary: 'Leave the current organization' })
  leave(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.memberships.leave(organizationId, tenant);
  }

  @Get(':organizationId/invitations')
  @TenantRequired()
  @UseGuards(CapabilitiesGuard)
  @RequireCapabilities(OrganizationCapability.INVITATION_READ)
  @ApiOperation({
    summary:
      'List invitation lifecycle metadata without recipient or token data',
  })
  invitationsList(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.invitations.findAll(organizationId, tenant);
  }

  @Post(':organizationId/invitations')
  @TenantRequired()
  @UseGuards(CapabilitiesGuard)
  @RequireCapabilities(OrganizationCapability.INVITATION_CREATE)
  @ApiOperation({ summary: 'Create a seven-day organization invitation' })
  createInvitation(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: CreateInvitationDto,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.invitations.create(organizationId, dto, tenant);
  }

  @Post(':organizationId/invitations/:invitationId/revoke')
  @TenantRequired()
  @UseGuards(CapabilitiesGuard)
  @RequireCapabilities(OrganizationCapability.INVITATION_REVOKE)
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  revokeInvitation(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.invitations.revoke(organizationId, invitationId, tenant);
  }
}
