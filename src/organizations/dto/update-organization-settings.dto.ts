import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsInt, Max, Min, ValidateIf } from 'class-validator';
import { OrganizationConfigurationPreconditionDto } from './organization-configuration-precondition.dto';

export class UpdateOrganizationSettingsDto extends OrganizationConfigurationPreconditionDto {
  @ApiProperty({
    nullable: true,
    minimum: 1,
    maximum: 1440,
    description:
      'Persisted default duration in minutes. Null resets the effective duration to 60 minutes.',
    example: 50,
  })
  @IsDefined()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(1440)
  defaultAppointmentDuration: number | null;
}
