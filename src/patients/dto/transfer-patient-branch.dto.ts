import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class TransferPatientBranchDto {
  @ApiProperty({
    description: 'Target branch UUID where the patient is being transferred',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4', { message: 'targetBranchId must be a valid UUID' })
  @IsNotEmpty({ message: 'targetBranchId is required' })
  targetBranchId: string;

  @ApiPropertyOptional({
    description:
      'Optional UUID of the new primary psychologist assigned to the patient at target branch',
    format: 'uuid',
    example: '660e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID('4', { message: 'targetPsychologistId must be a valid UUID' })
  @IsOptional()
  targetPsychologistId?: string;

  @ApiProperty({
    description: 'Justification and reason for the branch transfer',
    minLength: 3,
    maxLength: 500,
    example: 'Paciente cambió de lugar de residencia a sucursal Norte.',
  })
  @IsString({ message: 'reason must be a string' })
  @IsNotEmpty({ message: 'reason is required' })
  @MinLength(3, { message: 'reason must be at least 3 characters long' })
  @MaxLength(500, { message: 'reason cannot exceed 500 characters' })
  reason: string;
}
