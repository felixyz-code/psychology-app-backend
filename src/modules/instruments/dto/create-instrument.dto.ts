import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateInstrumentDto {
  @ApiProperty({
    example: 'PHQ-9',
    description: 'Unique instrument code within tenant or system catalog',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @ApiProperty({
    example: 'Cuestionario de Salud del Paciente (PHQ-9)',
    description: 'Full human-readable title of the instrument',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({
    example: 'Cuestionario estandarizado para evaluar severidad depresiva.',
    description:
      'Detailed description of the instrument and its clinical utility',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: 'Población adulta (>= 18 años)',
    description: 'Target demographic or clinical population',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  targetPopulation?: string;
}
