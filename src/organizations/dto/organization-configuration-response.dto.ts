import { ApiProperty } from '@nestjs/swagger';

export enum OrganizationConfigurationRowState {
  ABSENT = 'ABSENT',
  PRESENT = 'PRESENT',
}

export class OrganizationSettingsResponseDto {
  @ApiProperty({ enum: OrganizationConfigurationRowState })
  rowState: OrganizationConfigurationRowState;

  @ApiProperty({ format: 'date-time', nullable: true })
  updatedAt: Date | null;

  @ApiProperty({
    minimum: 1,
    maximum: 1440,
    description: 'Effective duration; 60 when no configured duration exists.',
  })
  defaultAppointmentDuration: number;

  @ApiProperty({
    nullable: true,
    minimum: 1,
    maximum: 1440,
    description:
      'Persisted value; null indicates the effective 60-minute fallback.',
  })
  persistedDefaultAppointmentDuration: number | null;
}

export class OrganizationBrandingResponseDto {
  @ApiProperty({ enum: OrganizationConfigurationRowState })
  rowState: OrganizationConfigurationRowState;

  @ApiProperty({ format: 'date-time', nullable: true })
  updatedAt: Date | null;

  @ApiProperty({
    nullable: true,
    pattern: '^#[0-9A-F]{6}$',
    description:
      'Persisted organization accent; null means use the platform fallback.',
  })
  primaryColor: string | null;
}
