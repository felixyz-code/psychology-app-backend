import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DocumentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  caseFileId: string;

  @ApiProperty({ format: 'uuid' })
  uploadedById: string;

  @ApiProperty()
  fileName: string;

  @ApiProperty({
    description: 'Relative stored document path returned by the existing API',
    example: 'uploads/patients/patient-id/document-id.pdf',
  })
  filePath: string;

  @ApiPropertyOptional({ nullable: true, example: 'application/pdf' })
  mimeType: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  uploadedAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}
