import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttachmentCategory } from '@prisma/client';

export class AttachmentUploaderDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;
}

export class CaseFileAttachmentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  caseFileId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  organizationId!: string | null;

  @ApiProperty({ format: 'uuid' })
  uploadedById!: string;

  @ApiProperty()
  fileName!: string;

  @ApiProperty()
  originalName!: string;

  @ApiProperty()
  mimeType!: string;

  @ApiProperty()
  sizeBytes!: number;

  @ApiProperty({ enum: AttachmentCategory })
  category!: AttachmentCategory;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional({ type: AttachmentUploaderDto })
  uploadedBy?: AttachmentUploaderDto;
}
