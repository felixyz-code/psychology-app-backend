import { MembershipRole } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, NotEquals } from 'class-validator';
import { MembershipMutationPreconditionDto } from './membership-mutation-precondition.dto';

export class ChangeMembershipRoleDto extends MembershipMutationPreconditionDto {
  @ApiProperty({ enum: MembershipRole, example: MembershipRole.PSYCHOLOGIST })
  @IsEnum(MembershipRole)
  @NotEquals(MembershipRole.OWNER)
  role: MembershipRole;
}
