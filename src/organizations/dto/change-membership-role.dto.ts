import { MembershipRole } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, NotEquals } from 'class-validator';

export class ChangeMembershipRoleDto {
  @ApiProperty({ enum: MembershipRole, example: MembershipRole.PSYCHOLOGIST })
  @IsEnum(MembershipRole)
  @NotEquals(MembershipRole.OWNER)
  role: MembershipRole;
}
