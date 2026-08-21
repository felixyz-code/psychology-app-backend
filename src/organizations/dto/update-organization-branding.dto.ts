import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDefined,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { OrganizationConfigurationPreconditionDto } from './organization-configuration-precondition.dto';

const STRICT_HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

function trimToNull({ value }: { value: unknown }) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return value;
}

export class UpdateOrganizationBrandingDto extends OrganizationConfigurationPreconditionDto {
  @ApiPropertyOptional({
    nullable: true,
    description: 'Visual display or trade name for tenant branding.',
    example: 'Centro de Psicología Integral',
  })
  @IsOptional()
  @Transform(trimToNull)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(150)
  visualName?: string | null;

  @ApiProperty({
    nullable: true,
    pattern: '^#[0-9A-F]{6}$',
    description:
      'Organization primary brand color. Null resets to the platform accent fallback.',
    example: '#2563EB',
  })
  @IsDefined()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(STRICT_HEX_COLOR)
  primaryColor: string | null;

  @ApiPropertyOptional({
    nullable: true,
    pattern: '^#[0-9A-F]{6}$',
    description:
      'Organization brand accent color. Null resets to the platform accent fallback.',
    example: '#0D9488',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @Matches(STRICT_HEX_COLOR)
  accentColor?: string | null;
}
