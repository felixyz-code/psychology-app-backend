import { MembershipStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export const MUTABLE_MEMBERSHIP_STATUSES = [
  MembershipStatus.ACTIVE,
  MembershipStatus.SUSPENDED,
] as const;

export class ChangeMembershipStatusDto {
  @ApiProperty({ enum: MUTABLE_MEMBERSHIP_STATUSES })
  @IsEnum(MUTABLE_MEMBERSHIP_STATUSES)
  status: 'ACTIVE' | 'SUSPENDED';
}
