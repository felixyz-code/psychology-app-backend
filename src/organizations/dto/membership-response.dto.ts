import { MembershipRole, MembershipStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export enum MembershipAllowedAction {
  CHANGE_ROLE = 'CHANGE_ROLE',
  SUSPEND = 'SUSPEND',
  REACTIVATE = 'REACTIVATE',
  REMOVE = 'REMOVE',
}

export class MembershipListItemDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty()
  displayName: string;

  @ApiProperty({ format: 'email' })
  email: string;

  @ApiProperty({ enum: MembershipRole })
  role: MembershipRole;

  @ApiProperty({ enum: MembershipStatus })
  status: MembershipStatus;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  joinedAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  suspendedAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  revokedAt: Date | null;

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;

  @ApiProperty({ enum: MembershipAllowedAction, isArray: true })
  allowedActions: MembershipAllowedAction[];
}

export class MembershipMutationResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ enum: MembershipRole })
  role: MembershipRole;

  @ApiProperty({ enum: MembershipStatus })
  status: MembershipStatus;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;
}

export class MembershipConflictResponseDto {
  @ApiProperty({ enum: [409], example: 409 })
  statusCode: number;

  @ApiProperty({
    enum: [
      'CONFLICT',
      'CONCURRENT_UPDATE',
      'LAST_OWNER_PROTECTED',
      'TENANT_CONTEXT_REQUIRED',
    ],
  })
  code:
    | 'CONFLICT'
    | 'CONCURRENT_UPDATE'
    | 'LAST_OWNER_PROTECTED'
    | 'TENANT_CONTEXT_REQUIRED';

  @ApiProperty()
  message: string;

  @ApiProperty()
  requestId: string;

  @ApiProperty({ type: Object, nullable: true })
  details: Record<string, unknown> | null;
}
