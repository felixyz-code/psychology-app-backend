import { ApiProperty } from '@nestjs/swagger';
import { MembershipRole, MembershipStatus } from '@prisma/client';
import { IsUUID } from 'class-validator';

export class TransferOwnershipDto {
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  targetMembershipId: string;
}

export class OwnershipTransferMembershipDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ enum: MembershipRole, example: MembershipRole.ADMIN })
  role: MembershipRole;

  @ApiProperty({ enum: MembershipStatus, example: MembershipStatus.ACTIVE })
  status: MembershipStatus;
}

export class OwnershipTransferResponseDto {
  @ApiProperty({ format: 'uuid' })
  organizationId: string;

  @ApiProperty({ type: OwnershipTransferMembershipDto })
  sourceMembership: OwnershipTransferMembershipDto;

  @ApiProperty({ type: OwnershipTransferMembershipDto })
  targetMembership: OwnershipTransferMembershipDto;

  @ApiProperty({ format: 'date-time' })
  transferredAt: Date;
}
