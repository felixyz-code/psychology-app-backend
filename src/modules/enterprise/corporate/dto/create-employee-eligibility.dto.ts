import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmployeeEligibilityStatus } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateEmployeeEligibilityDto {
  @ApiProperty({
    example: 'john.doe@acme.com',
    description: 'Corporate email of the employee',
    maxLength: 255,
  })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  email!: string;

  @ApiPropertyOptional({
    example: 'EMP-90210',
    description: 'Employee or payroll identification number',
    maxLength: 60,
  })
  @IsString()
  @IsOptional()
  @MaxLength(60)
  employeeNumber?: string;

  @ApiPropertyOptional({
    example: '12345678-9',
    description: 'National ID / Tax identification of the employee',
    maxLength: 60,
  })
  @IsString()
  @IsOptional()
  @MaxLength(60)
  nationalId?: string;

  @ApiPropertyOptional({
    example: 'John',
    description: 'First name of the employee',
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({
    example: 'Doe',
    description: 'Last name of the employee',
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({
    example: 'Engineering',
    description: 'Department or business unit for anonymized reporting',
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  department?: string;

  @ApiPropertyOptional({
    example: 6,
    description:
      'Maximum sessions allowed for this employee (overrides agreement default if set)',
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxSessionsAllowed?: number;

  @ApiPropertyOptional({
    enum: EmployeeEligibilityStatus,
    default: EmployeeEligibilityStatus.ACTIVE,
    description: 'Eligibility status',
  })
  @IsEnum(EmployeeEligibilityStatus)
  @IsOptional()
  status?: EmployeeEligibilityStatus;
}
