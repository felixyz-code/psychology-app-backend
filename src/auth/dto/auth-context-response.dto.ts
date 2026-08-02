import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MembershipRole, UserRole } from '@prisma/client';
import { TenantResolutionMode } from '../../common/request-context/request-context.service';

export class AuthContextTenantResponseDto {
  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ format: 'uuid' })
  organizationId: string;

  @ApiProperty({ format: 'uuid' })
  membershipId: string;

  @ApiProperty({
    enum: MembershipRole,
    example: MembershipRole.OWNER,
  })
  organizationRole: MembershipRole;

  @ApiProperty({
    enum: UserRole,
    example: UserRole.PSYCHOLOGIST,
  })
  legacyUserRole: UserRole;

  @ApiProperty({
    enum: TenantResolutionMode,
    example: TenantResolutionMode.EXPLICIT,
  })
  resolutionMode: TenantResolutionMode;
}

export class AuthContextSelectableMembershipResponseDto {
  @ApiProperty({ format: 'uuid' })
  membershipId: string;

  @ApiProperty({ format: 'uuid' })
  organizationId: string;

  @ApiProperty({ example: 'Consultorio Norte' })
  organizationDisplayName: string;

  @ApiProperty({
    enum: MembershipRole,
    example: MembershipRole.PSYCHOLOGIST,
  })
  organizationRole: MembershipRole;
}

export class AuthContextResolvedDto {
  @ApiProperty({
    enum: ['RESOLVED'],
    example: 'RESOLVED',
  })
  status: 'RESOLVED';

  @ApiProperty({ type: AuthContextTenantResponseDto })
  tenantContext: AuthContextTenantResponseDto;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'UX preference only; does not select or authorize tenant access.',
  })
  preferredOrganizationId: string | null;
}

export class AuthContextUnresolvedDto {
  @ApiProperty({
    enum: ['UNRESOLVED'],
    example: 'UNRESOLVED',
  })
  status: 'UNRESOLVED';

  @ApiProperty({
    type: AuthContextSelectableMembershipResponseDto,
    isArray: true,
  })
  selectableMemberships: AuthContextSelectableMembershipResponseDto[];

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'UX preference only; does not select or authorize tenant access.',
  })
  preferredOrganizationId: string | null;
}

export class AuthContextLegacyCompatibilityDto {
  @ApiProperty({
    enum: ['LEGACY_COMPATIBILITY'],
    example: 'LEGACY_COMPATIBILITY',
  })
  status: 'LEGACY_COMPATIBILITY';

  @ApiProperty({
    type: AuthContextSelectableMembershipResponseDto,
    isArray: true,
  })
  selectableMemberships: AuthContextSelectableMembershipResponseDto[];

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description:
      'UX preference only; does not select or authorize tenant access.',
  })
  preferredOrganizationId: string | null;
}
