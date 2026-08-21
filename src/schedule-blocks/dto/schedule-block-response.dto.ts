import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ScheduleBlockResponseDto {
  @ApiProperty({
    description: 'Schedule block ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiPropertyOptional({
    description: 'Organization ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  organizationId?: string | null;

  @ApiProperty({
    description: 'Therapist User ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  therapistId!: string;

  @ApiProperty({
    description: 'Title of the block',
    example: 'Capacitación NOM-004',
  })
  title!: string;

  @ApiPropertyOptional({
    description: 'Reason for the schedule block',
    example: 'Asistencia obligatoria a simposio médico',
  })
  reason?: string | null;

  @ApiProperty({
    description: 'Block start time ISO',
    example: '2026-08-25T14:00:00.000Z',
  })
  startTime!: Date;

  @ApiProperty({
    description: 'Block end time ISO',
    example: '2026-08-25T17:00:00.000Z',
  })
  endTime!: Date;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2026-08-21T09:00:00.000Z',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'Update timestamp',
    example: '2026-08-21T09:00:00.000Z',
  })
  updatedAt!: Date;
}
