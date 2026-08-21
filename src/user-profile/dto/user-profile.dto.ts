import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateUserProfileDto {
  @ApiPropertyOptional({
    description: 'Professional display name for notes and reports',
    example: 'Lic. María Elena Rivera',
    maxLength: 150,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  professionalName?: string;

  @ApiPropertyOptional({
    description: 'Official professional license number (Cédula profesional)',
    example: '12345678',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  licenseNumber?: string;

  @ApiPropertyOptional({
    description: 'Professional contact phone number',
    example: '+52 55 1234 5678',
    maxLength: 30,
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({
    description: 'Clinical specialties and therapeutic approaches',
    example: [
      'Terapia Cognitivo-Conductual',
      'Evaluación Neuropsicológica',
      'Psicoterapia de Pareja',
    ],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialties?: string[];

  @ApiPropertyOptional({
    description: 'Professional biography or clinical summary',
    example:
      'Psicóloga clínica con más de 10 años de experiencia en evaluación y tratamiento cognitivo-conductual.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;
}
