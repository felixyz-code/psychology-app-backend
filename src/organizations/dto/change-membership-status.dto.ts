import { MembershipStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { MembershipMutationPreconditionDto } from './membership-mutation-precondition.dto';

export const MUTABLE_MEMBERSHIP_STATUSES = [
  MembershipStatus.ACTIVE,
  MembershipStatus.SUSPENDED,
] as const;

export class ChangeMembershipStatusDto extends MembershipMutationPreconditionDto {
  @ApiProperty({ enum: MUTABLE_MEMBERSHIP_STATUSES })
  @IsEnum(MUTABLE_MEMBERSHIP_STATUSES)
  status: 'ACTIVE' | 'SUSPENDED';
}
