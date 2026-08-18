import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateBranchDto {
  @ApiProperty({
    description: 'Branch descriptive name',
    example: 'Sede Central (Matriz)',
    maxLength: 120,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({
    description: 'Unique branch code within the organization',
    example: 'CDMX-CENTRO',
    maxLength: 30,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  code: string;

  @ApiPropertyOptional({
    description: 'Physical address of the branch',
    example: 'Av. Insurgentes Sur 1234, CDMX',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiPropertyOptional({
    description: 'Contact phone number for the branch',
    example: '+525512345678',
    maxLength: 30,
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({
    description: 'IANA timezone for branch operations',
    example: 'America/Mexico_City',
    default: 'UTC',
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  timezone?: string;

  @ApiPropertyOptional({
    description: 'Whether the branch is currently active',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
