import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class QueryScheduleBlocksDto {
  @ApiPropertyOptional({
    description: 'Filter blocks by therapist User ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  therapistId?: string;

  @ApiPropertyOptional({
    description: 'Filter blocks starting on or after this ISO date',
    example: '2026-08-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Filter blocks ending on or before this ISO date',
    example: '2026-08-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
