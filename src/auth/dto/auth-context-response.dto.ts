import { ApiProperty } from '@nestjs/swagger';
import {
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
} from '@prisma/client';
import { TenantResolutionMode } from '../../common/request-context/request-context.service';

export enum AuthContextStatus {
  ACTIVE_TENANT_READY = 'ACTIVE_TENANT_READY',
  AMBIGUOUS_SELECTION = 'AMBIGUOUS_SELECTION',
  NO_ACTIVE_TENANT = 'NO_ACTIVE_TENANT',
  ADMIN_SUSPENDED_CONTEXT = 'ADMIN_SUSPENDED_CONTEXT',
}

export class AuthContextTenantResponseDto {
  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ format: 'uuid' })
  organizationId: string;

  @ApiProperty({ format: 'uuid' })
  membershipId: string;

  @ApiProperty({ enum: MembershipRole, example: MembershipRole.OWNER })
  organizationRole: MembershipRole;

  @ApiProperty({
    enum: TenantResolutionMode,
    example: TenantResolutionMode.EXPLICIT,
  })
  resolutionMode: TenantResolutionMode;
}

export class AuthContextOrganizationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Consultorio Norte' })
  displayName: string;

  @ApiProperty({ enum: OrganizationStatus, example: OrganizationStatus.ACTIVE })
  status: OrganizationStatus;
}

export class AuthContextMembershipResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ type: String, nullable: true, example: 'Dra. Rivera' })
  displayName: string | null;

  @ApiProperty({ example: 'rivera@example.com' })
  email: string;

  @ApiProperty({ enum: MembershipRole, example: MembershipRole.OWNER })
  role: MembershipRole;

  @ApiProperty({ enum: MembershipStatus, example: MembershipStatus.ACTIVE })
  status: MembershipStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;

  @ApiProperty({ example: true })
  isCurrentUser: boolean;
}

export class AuthContextSelectableMembershipResponseDto {
  @ApiProperty({ format: 'uuid' })
  membershipId: string;

  @ApiProperty({ format: 'uuid' })
  organizationId: string;

  @ApiProperty({ example: 'Consultorio Norte' })
  organizationDisplayName: string;

  @ApiProperty({ enum: MembershipRole, example: MembershipRole.PSYCHOLOGIST })
  organizationRole: MembershipRole;
}

export class AuthContextResponseV1Dto {
  @ApiProperty({ enum: [1], example: 1 })
  schemaVersion: 1;

  @ApiProperty({
    enum: AuthContextStatus,
    example: AuthContextStatus.ACTIVE_TENANT_READY,
  })
  status: AuthContextStatus;

  @ApiProperty({ type: AuthContextTenantResponseDto, nullable: true })
  tenantContext: AuthContextTenantResponseDto | null;

  @ApiProperty({ type: AuthContextOrganizationResponseDto, nullable: true })
  organization: AuthContextOrganizationResponseDto | null;

  @ApiProperty({ type: AuthContextMembershipResponseDto, nullable: true })
  membership: AuthContextMembershipResponseDto | null;

  @ApiProperty({ type: String, isArray: true, example: ['organization.read'] })
  capabilities: string[];

  @ApiProperty({
    type: AuthContextSelectableMembershipResponseDto,
    isArray: true,
  })
  selectableMemberships: AuthContextSelectableMembershipResponseDto[];

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  preferredOrganizationId: string | null;
}
