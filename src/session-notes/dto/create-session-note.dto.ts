import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDate,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateSessionNoteDto {
  @ApiProperty({
    description: 'Case file ID linked to the session note',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  caseFileId: string;

  @ApiProperty({
    description: 'Author user ID linked to the session note',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsUUID()
  authorId: string;

  @ApiPropertyOptional({
    description: 'Session note title',
    maxLength: 150,
    example: 'Initial assessment',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @ApiProperty({
    description: 'Detailed session note content',
    example: 'Patient reports increased anxiety during the last week.',
  })
  @IsString()
  content: string;

  @ApiProperty({
    description: 'Date and time of the session',
    type: String,
    format: 'date-time',
    example: '2026-06-19T17:30:00.000Z',
  })
  @Type(() => Date)
  @IsDate()
  sessionDate: Date;
}
