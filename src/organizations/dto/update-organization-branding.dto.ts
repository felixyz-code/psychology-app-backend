import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsString, Matches, ValidateIf } from 'class-validator';
import { OrganizationConfigurationPreconditionDto } from './organization-configuration-precondition.dto';

const STRICT_HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export class UpdateOrganizationBrandingDto extends OrganizationConfigurationPreconditionDto {
  @ApiProperty({
    nullable: true,
    pattern: '^#[0-9A-F]{6}$',
    description:
      'Organization brand accent. Null resets to the platform accent fallback.',
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
}
