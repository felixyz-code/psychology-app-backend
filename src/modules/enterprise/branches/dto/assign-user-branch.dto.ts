import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class AssignUserBranchDto {
  @ApiProperty({
    description: 'User UUID to assign to the branch',
    example: '23000000-0000-4000-8000-000000000001',
  })
  @IsUUID('4')
  @IsNotEmpty()
  userId: string;

  @ApiPropertyOptional({
    description:
      'Branch UUID where access is granted (optional in body as it is extracted from route parameter)',
    example: '34000000-0000-4000-8000-000000000001',
  })
  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @ApiPropertyOptional({
    description: 'Whether this branch is the primary location for the user',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
