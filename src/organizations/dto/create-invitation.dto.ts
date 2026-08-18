import { MembershipRole } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, MaxLength, NotEquals } from 'class-validator';

export class CreateInvitationDto {
  @ApiProperty({ example: 'invitee@example.test' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ enum: MembershipRole, example: MembershipRole.PSYCHOLOGIST })
  @IsEnum(MembershipRole)
  @NotEquals(MembershipRole.OWNER)
  role: MembershipRole;
}
