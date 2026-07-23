import { MembershipStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export class ChangeMembershipStatusDto {
  @ApiProperty({ enum: [MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED] })
  @IsEnum(MembershipStatus)
  status: 'ACTIVE' | 'SUSPENDED';
}
