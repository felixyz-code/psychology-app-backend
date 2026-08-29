import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class ScheduleSlotDto {
  @ApiProperty({
    description: 'Day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)',
    minimum: 0,
    maximum: 6,
    example: 1,
  })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @ApiProperty({
    description: 'Start time in 24-hour HH:mm format',
    example: '09:00',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'startTime must be in HH:mm 24-hour format (e.g., 09:00, 14:30)',
  })
  startTime: string;

  @ApiProperty({
    description: 'End time in 24-hour HH:mm format',
    example: '18:00',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'endTime must be in HH:mm 24-hour format (e.g., 18:00, 19:30)',
  })
  endTime: string;

  @ApiPropertyOptional({
    description: 'Standard slot duration in minutes for appointments',
    default: 60,
    minimum: 15,
    maximum: 240,
    example: 60,
  })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(240)
  durationSlotMinutes?: number;

  @ApiPropertyOptional({
    description: 'Whether this schedule slot is currently active',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
