import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSessionNoteDto {
  @ApiPropertyOptional({
    description: 'Session note title',
    maxLength: 150,
    example: 'Initial assessment',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @ApiPropertyOptional({
    description: 'Detailed session note content',
    example: 'Patient reports increased anxiety during the last week.',
  })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({
    description: 'Date and time of the session',
    type: String,
    format: 'date-time',
    example: '2026-06-19T17:30:00.000Z',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  sessionDate?: Date;
}
