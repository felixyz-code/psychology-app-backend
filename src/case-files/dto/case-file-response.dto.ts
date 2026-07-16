import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CaseFileResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  patientId: string;

  @ApiPropertyOptional({ nullable: true })
  diagnosis: string | null;

  @ApiPropertyOptional({ nullable: true })
  treatmentPlan: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt: Date;
}
