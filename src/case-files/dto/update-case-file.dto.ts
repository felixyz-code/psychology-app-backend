import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateCaseFileDto {
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
