import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateCaseFileDto {
  @ApiProperty({
    description: 'Patient ID linked to the case file',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  patientId: string;

  @ApiPropertyOptional({
    description: 'Clinical diagnosis summary',
    example: 'Generalized anxiety disorder',
  })
  @IsOptional()
  @IsString()
  diagnosis?: string;

  @ApiPropertyOptional({
    description: 'Treatment plan summary',
    example: 'Weekly cognitive behavioral therapy sessions',
  })
  @IsOptional()
  @IsString()
  treatmentPlan?: string;
}
