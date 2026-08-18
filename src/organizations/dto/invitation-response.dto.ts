import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { InvitationLogicalStatus } from '../invitation-runtime';

export class InvitationListItemDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'invitee@example.test' })
  email: string;

  @ApiProperty({ enum: MembershipRole, example: MembershipRole.PSYCHOLOGIST })
  role: MembershipRole;

  @ApiProperty({
    enum: InvitationLogicalStatus,
    example: InvitationLogicalStatus.PENDING,
  })
  logicalStatus: InvitationLogicalStatus;

  @ApiProperty({ format: 'date-time' })
  expiresAt: Date;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  acceptedAt: Date | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  rejectedAt: Date | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  revokedAt: Date | null;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  expiredAt: Date | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  invitedUserId: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  acceptedByUserId: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;
}

export class InvitationIssueResponseDto extends InvitationListItemDto {
  @ApiPropertyOptional({
    description:
      'Clear invitation token returned once only outside production for local/test flows.',
  })
  token?: string;
}

export class InvitationRevokeResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({
    enum: InvitationLogicalStatus,
    example: InvitationLogicalStatus.REVOKED,
  })
  logicalStatus: InvitationLogicalStatus;

  @ApiProperty({ format: 'date-time' })
  revokedAt: Date;
}
