import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SessionNoteResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  caseFileId: string;

  @ApiProperty({ format: 'uuid' })
  authorId: string;

  @ApiProperty({ type: String, format: 'date-time' })
  sessionDate: Date;

  @ApiPropertyOptional({ nullable: true })
  title: string | null;

  @ApiProperty()
  content: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}
