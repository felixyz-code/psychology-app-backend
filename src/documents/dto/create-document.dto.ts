import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateDocumentDto {
  @ApiProperty({
    description: 'Case file ID linked to the document',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  caseFileId: string;

  @ApiProperty({
    description: 'User ID who uploaded the document metadata',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsUUID()
  uploadedById: string;

  @ApiProperty({
    description: 'Original file name',
    maxLength: 255,
    example: 'consentimiento.pdf',
  })
  @IsString()
  @MaxLength(255)
  fileName: string;

  @ApiProperty({
    description: 'Logical or future physical file path',
    example: 'uploads/patients/patient-id/consentimiento.pdf',
  })
  @IsString()
  filePath: string;

  @ApiPropertyOptional({
    description: 'MIME type of the document',
    maxLength: 100,
    example: 'application/pdf',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  mimeType?: string;
}
