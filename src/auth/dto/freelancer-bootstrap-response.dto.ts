import { ApiProperty } from '@nestjs/swagger';
import {
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
} from '@prisma/client';
import { AuthenticatedUserResponseDto } from './login-response.dto';

export class FreelancerBootstrapOrganizationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'consultorio-ana-martinez' })
  slug: string;

  @ApiProperty({ example: 'Consultorio Ana Martinez' })
  legalName: string;

  @ApiProperty({ example: 'Consultorio Ana Martinez' })
  displayName: string;

  @ApiProperty({ enum: OrganizationStatus, example: OrganizationStatus.ACTIVE })
  status: OrganizationStatus;

  @ApiProperty({ example: 'UTC' })
  timezone: string;

  @ApiProperty({ example: 'es-MX' })
  locale: string;

  @ApiProperty({ example: 'MXN' })
  currency: string;
}

export class FreelancerBootstrapMembershipResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  organizationId: string;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ enum: MembershipRole, example: MembershipRole.OWNER })
  role: MembershipRole;

  @ApiProperty({ enum: MembershipStatus, example: MembershipStatus.ACTIVE })
  status: MembershipStatus;

  @ApiProperty({ format: 'date-time' })
  joinedAt: Date;
}

export class FreelancerBootstrapResponseDto {
  @ApiProperty({
    description: 'JWT access token to send in the Authorization Bearer header',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({ type: AuthenticatedUserResponseDto })
  user: AuthenticatedUserResponseDto;

  @ApiProperty({ type: FreelancerBootstrapOrganizationResponseDto })
  organization: FreelancerBootstrapOrganizationResponseDto;

  @ApiProperty({ type: FreelancerBootstrapMembershipResponseDto })
  membership: FreelancerBootstrapMembershipResponseDto;
}
