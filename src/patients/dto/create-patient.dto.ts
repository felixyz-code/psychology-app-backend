import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDate,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreatePatientDto {
  @ApiProperty({
    description: 'Psychologist user ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  psychologistId: string;

  @ApiProperty({
    description: 'Patient first name',
    maxLength: 100,
    example: 'Ana',
  })
  @IsString()
  @MaxLength(100)
  firstName: string;

  @ApiProperty({
    description: 'Patient last name',
    maxLength: 100,
    example: 'Martinez',
  })
  @IsString()
  @MaxLength(100)
  lastName: string;

  @ApiPropertyOptional({
    description: 'Patient phone number',
    maxLength: 30,
    example: '+526621234567',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phoneNumber?: string;

  @ApiPropertyOptional({
    description: 'Patient email address',
    maxLength: 255,
    example: 'ana.martinez@example.com',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({
    description: 'Patient birth date',
    type: String,
    format: 'date',
    example: '1990-05-12',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  birthDate?: Date;
}
