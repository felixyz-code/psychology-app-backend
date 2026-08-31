import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { OrganizationStatus } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AllowedOrganizationStatuses } from '../tenant-context/decorators/allowed-organization-statuses.decorator';
import { RequireCapabilities } from '../tenant-context/authorization/require-capabilities.decorator';
import { CapabilitiesGuard } from '../tenant-context/authorization/capabilities.guard';
import { OrganizationCapability } from '../tenant-context/authorization/organization-capability';
import { CurrentTenant } from '../tenant-context/decorators/current-tenant.decorator';
import { TenantRequired } from '../tenant-context/decorators/tenant-required.decorator';
import type { TenantContext } from '../tenant-context/tenant-context.types';
import { QuotaGuard } from '../billing/guards/quota.guard';
import { RequireQuota } from '../billing/decorators/require-quota.decorator';
import { QuotaResource } from '../billing/exceptions/quota-exceeded.exception';
import { ChangeOrganizationStatusDto } from './dto/change-organization-status.dto';
import { ChangeMembershipRoleDto } from './dto/change-membership-role.dto';
import { ChangeMembershipStatusDto } from './dto/change-membership-status.dto';
import { MembershipMutationPreconditionDto } from './dto/membership-mutation-precondition.dto';
import {
  MembershipConflictResponseDto,
  MembershipListItemDto,
  MembershipMutationResponseDto,
} from './dto/membership-response.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import {
  InvitationIssueResponseDto,
  InvitationListItemDto,
  InvitationRevokeResponseDto,
} from './dto/invitation-response.dto';
import {
  OwnershipTransferResponseDto,
  TransferOwnershipDto,
} from './dto/transfer-ownership.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import {
  OrganizationBrandingResponseDto,
  OrganizationSettingsResponseDto,
} from './dto/organization-configuration-response.dto';
import { UpdateOrganizationBrandingDto } from './dto/update-organization-branding.dto';
import { UpdateOrganizationSettingsDto } from './dto/update-organization-settings.dto';
import { OrganizationConfigurationService } from './organization-configuration.service';
import { InvitationsService } from './invitations.service';
import { MembershipsService } from './memberships.service';
import { OrganizationsService } from './organizations.service';
import { AuditLog } from '../audit-logs/decorators/audit-log.decorator';

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
    private readonly configuration: OrganizationConfigurationService,
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
  @AllowedOrganizationStatuses(
    OrganizationStatus.ACTIVE,
    OrganizationStatus.SUSPENDED,
  )
  @UseGuards(CapabilitiesGuard)
  @RequireCapabilities(OrganizationCapability.ORGANIZATION_READ)
  @ApiOperation({ summary: 'Get the currently resolved organization' })
  current(@CurrentTenant(true) tenant: TenantContext) {
    return this.organizations.current(tenant);
  }

  @Get('me')
  @TenantRequired()
  @AllowedOrganizationStatuses(
    OrganizationStatus.ACTIVE,
    OrganizationStatus.SUSPENDED,
  )
  @UseGuards(CapabilitiesGuard)
  @RequireCapabilities(OrganizationCapability.ORGANIZATION_READ)
  @ApiOperation({ summary: 'Get the currently resolved organization' })
  me(@CurrentTenant(true) tenant: TenantContext) {
    return this.organizations.current(tenant);
  }

  @Get('my-memberships')
  @ApiOperation({
    summary: 'List active organization memberships of the authenticated user',
  })
  myMemberships(@CurrentUser() user: AuthenticatedUser) {
    return this.organizations.findAccessible(user);
  }

  @Get(':organizationId')
  @TenantRequired()
  @AllowedOrganizationStatuses(
    OrganizationStatus.ACTIVE,
    OrganizationStatus.SUSPENDED,
  )
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

  @Get(':organizationId/settings')
  @TenantRequired()
  @AllowedOrganizationStatuses(
    OrganizationStatus.ACTIVE,
    OrganizationStatus.SUSPENDED,
  )
  @UseGuards(CapabilitiesGuard)
  @RequireCapabilities(OrganizationCapability.ORGANIZATION_READ)
  @ApiOperation({
    summary: 'Get effective organization appointment-duration settings',
    description:
      'Returns rowState and updatedAt for concurrency. The effective duration is 60 when the row is absent or its persisted value is null.',
  })
  @ApiOkResponse({ type: OrganizationSettingsResponseDto })
  @ApiNotFoundResponse({ description: 'Organization not found' })
  getSettings(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.configuration.getSettings(organizationId, tenant);
  }

  @Patch(':organizationId/settings')
  @TenantRequired()
  @AllowedOrganizationStatuses(
    OrganizationStatus.ACTIVE,
    OrganizationStatus.SUSPENDED,
  )
  @UseGuards(CapabilitiesGuard)
  @RequireCapabilities(OrganizationCapability.ORGANIZATION_MANAGE)
  @AuditLog({
    action: 'ORGANIZATION_SETTINGS_UPDATE',
    resourceType: 'OrganizationSettings',
  })
  @ApiOperation({
    summary:
      'Update organization appointment-duration settings with compare-and-swap',
    description:
      'Supply exactly one precondition: expectedRowState ABSENT for a first write, or expectedUpdatedAt for a present row. Null resets the effective duration to 60.',
  })
  @ApiOkResponse({ type: OrganizationSettingsResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid duration or concurrency precondition',
  })
  @ApiConflictResponse({
    description: 'Stale or concurrent configuration mutation',
  })
  updateSettings(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: UpdateOrganizationSettingsDto,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.configuration.updateSettings(organizationId, dto, tenant);
  }

  @Get(':organizationId/branding')
  @TenantRequired()
  @AllowedOrganizationStatuses(
    OrganizationStatus.ACTIVE,
    OrganizationStatus.SUSPENDED,
  )
  @UseGuards(CapabilitiesGuard)
  @RequireCapabilities(OrganizationCapability.ORGANIZATION_READ)
  @ApiOperation({
    summary: 'Get organization brand accent configuration',
    description:
      'Returns rowState and updatedAt for concurrency. A null primaryColor means the platform accent fallback.',
  })
  @ApiOkResponse({ type: OrganizationBrandingResponseDto })
  @ApiNotFoundResponse({ description: 'Organization not found' })
  getBranding(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.configuration.getBranding(organizationId, tenant);
  }

  @Patch(':organizationId/branding')
  @TenantRequired()
  @AllowedOrganizationStatuses(
    OrganizationStatus.ACTIVE,
    OrganizationStatus.SUSPENDED,
  )
  @UseGuards(CapabilitiesGuard)
  @RequireCapabilities(OrganizationCapability.ORGANIZATION_MANAGE)
  @AuditLog({
    action: 'ORGANIZATION_BRANDING_UPDATE',
    resourceType: 'OrganizationBranding',
  })
  @ApiOperation({
    summary: 'Update organization brand accent with compare-and-swap',
    description:
      'Accepts only #RRGGBB or null and requires at least 3:1 WCAG contrast against approved #FFFFFF and #121212 surfaces. Supply exactly one concurrency precondition.',
  })
  @ApiOkResponse({ type: OrganizationBrandingResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid color, contrast, or concurrency precondition',
  })
  @ApiConflictResponse({
    description: 'Stale or concurrent configuration mutation',
  })
  updateBranding(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: UpdateOrganizationBrandingDto,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.configuration.updateBranding(organizationId, dto, tenant);
  }

  @Patch(':organizationId')
  @TenantRequired()
  @AllowedOrganizationStatuses(
    OrganizationStatus.ACTIVE,
    OrganizationStatus.SUSPENDED,
  )
  @UseGuards(CapabilitiesGuard)
  @RequireCapabilities(OrganizationCapability.ORGANIZATION_MANAGE)
  @AuditLog({
    action: 'ORGANIZATION_UPDATE',
    resourceType: 'Organization',
  })
  @ApiOperation({ summary: 'Update editable organization identity fields' })
  @ApiBadRequestResponse({
    description: 'Invalid payload or no editable organization fields provided',
  })
  @ApiConflictResponse({
    description: 'Unique conflict or concurrent organization change',
  })
  update(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: UpdateOrganizationDto,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.organizations.update(organizationId, dto, tenant);
  }

  @Patch(':organizationId/status')
  @TenantRequired()
  @AllowedOrganizationStatuses(
    OrganizationStatus.ACTIVE,
    OrganizationStatus.SUSPENDED,
  )
  @UseGuards(CapabilitiesGuard)
  @RequireCapabilities(OrganizationCapability.ORGANIZATION_MANAGE)
  @AuditLog({
    action: 'ORGANIZATION_STATUS_CHANGE',
    resourceType: 'Organization',
  })
  @ApiOperation({ summary: 'Suspend or reactivate an organization' })
  @ApiConflictResponse({
    description: 'Invalid organization transition or concurrent change',
  })
  changeOrganizationStatus(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: ChangeOrganizationStatusDto,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.organizations.changeStatus(organizationId, dto, tenant);
  }

  @Post(':organizationId/ownership-transfer')
  @TenantRequired()
  @AllowedOrganizationStatuses(
    OrganizationStatus.ACTIVE,
    OrganizationStatus.SUSPENDED,
  )
  @UseGuards(CapabilitiesGuard)
  @RequireCapabilities(OrganizationCapability.OWNERSHIP_TRANSFER)
  @AuditLog({
    action: 'ORGANIZATION_OWNERSHIP_TRANSFER',
    resourceType: 'Organization',
  })
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Transfer organization ownership from the current owner to an active non-owner membership',
  })
  @ApiOkResponse({ type: OwnershipTransferResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid payload' })
  @ApiForbiddenResponse({ description: 'Ownership transfer is not permitted' })
  @ApiNotFoundResponse({ description: 'Organization or membership not found' })
  @ApiConflictResponse({
    description:
      'Organization is suspended, target is ineligible, actor is no longer owner, or the transfer lost a concurrency race',
  })
  transferOwnership(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: TransferOwnershipDto,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.memberships.transferOwnership(
      organizationId,
      dto.targetMembershipId,
      tenant,
    );
  }

  @Get(':organizationId/memberships')
  @TenantRequired()
  @UseGuards(CapabilitiesGuard)
  @RequireCapabilities(OrganizationCapability.MEMBERSHIP_READ)
  @ApiOperation({ summary: 'List sanitized organization memberships' })
  @ApiOkResponse({ type: MembershipListItemDto, isArray: true })
  membershipsList(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.memberships.findAll(organizationId, tenant);
  }

  @Patch(':organizationId/memberships/:membershipId/role')
  @TenantRequired()
  @AuditLog({
    action: 'MEMBERSHIP_ROLE_CHANGE',
    resourceType: 'OrganizationMembership',
  })
  @ApiOperation({ summary: 'Change a non-owner membership role' })
  @ApiOkResponse({ type: MembershipMutationResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid role or precondition' })
  @ApiForbiddenResponse({ description: 'Membership action is not permitted' })
  @ApiConflictResponse({
    type: MembershipConflictResponseDto,
    description:
      'Invalid membership transition, stale precondition, or owner invariant',
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
      dto.expectedUpdatedAt,
      tenant,
    );
  }

  @Patch(':organizationId/memberships/:membershipId/status')
  @TenantRequired()
  @AuditLog({
    action: 'MEMBERSHIP_STATUS_CHANGE',
    resourceType: 'OrganizationMembership',
  })
  @ApiOperation({ summary: 'Suspend or reactivate a membership' })
  @ApiOkResponse({ type: MembershipMutationResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid status or precondition' })
  @ApiForbiddenResponse({ description: 'Membership action is not permitted' })
  @ApiConflictResponse({
    type: MembershipConflictResponseDto,
    description:
      'Invalid membership transition, stale precondition, or owner invariant',
  })
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
      dto.expectedUpdatedAt,
      tenant,
    );
  }

  @Delete(':organizationId/memberships/:membershipId')
  @TenantRequired()
  @AuditLog({
    action: 'MEMBERSHIP_REMOVE',
    resourceType: 'OrganizationMembership',
  })
  @ApiOperation({ summary: 'Remove a membership without deleting history' })
  @ApiOkResponse({ type: MembershipMutationResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid or missing precondition' })
  @ApiForbiddenResponse({ description: 'Membership action is not permitted' })
  @ApiConflictResponse({
    type: MembershipConflictResponseDto,
    description:
      'Invalid membership transition, stale precondition, or owner invariant',
  })
  remove(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: MembershipMutationPreconditionDto,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.memberships.remove(
      organizationId,
      membershipId,
      dto.expectedUpdatedAt,
      tenant,
    );
  }

  @Post(':organizationId/memberships/leave')
  @TenantRequired()
  @AuditLog({
    action: 'MEMBERSHIP_LEAVE',
    resourceType: 'OrganizationMembership',
  })
  @ApiOperation({ summary: 'Leave the current organization' })
  @ApiCreatedResponse({ type: MembershipMutationResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid or missing precondition' })
  @ApiForbiddenResponse({ description: 'Membership action is not permitted' })
  @ApiConflictResponse({
    type: MembershipConflictResponseDto,
    description: 'Stale precondition or last active owner invariant',
  })
  leave(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: MembershipMutationPreconditionDto,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.memberships.leave(
      organizationId,
      dto.expectedUpdatedAt,
      tenant,
    );
  }

  @Get(':organizationId/invitations')
  @TenantRequired()
  @UseGuards(CapabilitiesGuard)
  @RequireCapabilities(OrganizationCapability.INVITATION_READ)
  @ApiOperation({
    summary:
      'List invitation lifecycle metadata without recipient or token data',
  })
  @ApiOkResponse({ type: InvitationListItemDto, isArray: true })
  invitationsList(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.invitations.findAll(organizationId, tenant);
  }

  @Post(':organizationId/invitations')
  @TenantRequired()
  @UseGuards(CapabilitiesGuard, QuotaGuard)
  @RequireCapabilities(OrganizationCapability.INVITATION_CREATE)
  @RequireQuota(QuotaResource.THERAPISTS)
  @AuditLog({
    action: 'INVITATION_CREATE',
    resourceType: 'OrganizationInvitation',
  })
  @ApiOperation({ summary: 'Create a seven-day organization invitation' })
  @ApiCreatedResponse({ type: InvitationIssueResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid payload or invite role' })
  @ApiConflictResponse({
    description:
      'Pending invitation exists or the known recipient already has a non-terminal membership',
  })
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
  @AuditLog({
    action: 'INVITATION_REVOKE',
    resourceType: 'OrganizationInvitation',
  })
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  @HttpCode(200)
  @ApiOkResponse({ type: InvitationRevokeResponseDto })
  @ApiConflictResponse({
    description: 'Invitation is no longer pending',
  })
  revokeInvitation(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.invitations.revoke(organizationId, invitationId, tenant);
  }

  @Post(':organizationId/invitations/:invitationId/resend')
  @TenantRequired()
  @UseGuards(CapabilitiesGuard)
  @RequireCapabilities(OrganizationCapability.INVITATION_RESEND)
  @AuditLog({
    action: 'INVITATION_RESEND',
    resourceType: 'OrganizationInvitation',
  })
  @ApiOperation({
    summary: 'Replace a pending or expired invitation with a new token',
  })
  @ApiCreatedResponse({ type: InvitationIssueResponseDto })
  @ApiConflictResponse({
    description:
      'Invitation is not eligible for resend or a non-terminal membership already exists',
  })
  resendInvitation(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.invitations.resend(organizationId, invitationId, tenant);
  }
}
