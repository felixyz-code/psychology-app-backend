import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateCorporateClientDto {
  @ApiProperty({
    example: 'Acme Corporation',
    description: 'Legal name of the corporate client',
    maxLength: 150,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({
    example: 'Acme Health & Tech',
    description: 'Commercial or display name of the corporate client',
    maxLength: 150,
  })
  @IsString()
  @IsOptional()
  @MaxLength(150)
  commercialName?: string;

  @ApiPropertyOptional({
    example: 'ACM123456789',
    description: 'Tax identification number (RUT/RFC/EIN)',
    maxLength: 50,
  })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  taxId?: string;

  @ApiPropertyOptional({
    example: 'benefits@acme.com',
    description: 'Corporate HR or benefits contact email',
    maxLength: 255,
  })
  @IsEmail()
  @IsOptional()
  @MaxLength(255)
  contactEmail?: string;

  @ApiPropertyOptional({
    example: '+525512345678',
    description: 'Contact phone number',
    maxLength: 30,
  })
  @IsString()
  @IsOptional()
  @MaxLength(30)
  contactPhone?: string;

  @ApiPropertyOptional({
    example: ['@acme.com', '@acme-tech.com'],
    description:
      'Corporate email domain whitelist for automatic eligibility matching',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  domainWhitelist?: string[];

  @ApiPropertyOptional({
    example: 'Enterprise wellness agreement tier 1',
    description: 'Internal administrative notes',
  })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Whether the corporate client is active',
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
