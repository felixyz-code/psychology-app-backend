import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AvailabilitySlotDto {
  @ApiProperty({
    description: 'Slot start ISO string',
    example: '2026-08-25T08:00:00.000Z',
  })
  startTime!: string;

  @ApiProperty({
    description: 'Slot end ISO string',
    example: '2026-08-25T09:00:00.000Z',
  })
  endTime!: string;

  @ApiProperty({
    description: 'Whether the slot is available',
    example: true,
  })
  available!: boolean;

  @ApiPropertyOptional({
    description: 'Reason or type of conflict if not available',
    example: 'APPOINTMENT',
    enum: ['APPOINTMENT', 'SCHEDULE_BLOCK'],
  })
  conflictType?: 'APPOINTMENT' | 'SCHEDULE_BLOCK';

  @ApiPropertyOptional({
    description: 'Title or description if blocked by a schedule block',
    example: 'Capacitación Clínica',
  })
  title?: string;
}

export class AvailabilityResponseDto {
  @ApiProperty({
    description: 'Therapist / Psychologist User ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  therapistId!: string;

  @ApiProperty({
    description: 'Evaluated date (YYYY-MM-DD)',
    example: '2026-08-25',
  })
  date!: string;

  @ApiProperty({
    description: 'Slot duration evaluated in minutes',
    example: 60,
  })
  slotDurationMinutes!: number;

  @ApiProperty({
    description: 'List of calculated slots for the working day',
    type: AvailabilitySlotDto,
    isArray: true,
  })
  slots!: AvailabilitySlotDto[];
}
