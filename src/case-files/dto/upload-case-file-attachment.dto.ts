import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttachmentCategory } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadCaseFileAttachmentDto {
  @ApiProperty({
    enum: AttachmentCategory,
    description: 'Clinical category of the attachment',
    example: AttachmentCategory.ESTUDIO_PREVIO,
    default: AttachmentCategory.OTRO,
  })
  @IsEnum(AttachmentCategory)
  @IsOptional()
  category?: AttachmentCategory = AttachmentCategory.OTRO;

  @ApiPropertyOptional({
    description:
      'Clinical notes or observations associated with the attachment',
    example: 'Reporte psicopedagógico emitido por el colegio.',
    maxLength: 1000,
  })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;
}
