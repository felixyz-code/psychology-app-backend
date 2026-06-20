import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateDocumentDto {
  @ApiPropertyOptional({
    description: 'Original file name',
    maxLength: 255,
    example: 'consentimiento-actualizado.pdf',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @ApiPropertyOptional({
    description: 'Logical or future physical file path',
    example: 'uploads/patients/patient-id/consentimiento-actualizado.pdf',
  })
  @IsOptional()
  @IsString()
  filePath?: string;

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
