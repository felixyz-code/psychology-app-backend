import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CheckEligibilityDto {
  @ApiProperty({
    example: 'd3b07384-d113-40e1-a20d-773c68e14674',
    description: 'PAEF Agreement UUID',
  })
  @IsUUID()
  @IsNotEmpty()
  agreementId!: string;

  @ApiProperty({
    example: 'john.doe@acme.com',
    description: 'Employee email address to verify',
  })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiPropertyOptional({
    example: 'EMP-90210',
    description: 'Optional employee or payroll number',
  })
  @IsString()
  @IsOptional()
  employeeNumber?: string;

  @ApiPropertyOptional({
    example: 'b1b07384-d113-40e1-a20d-773c68e14674',
    description: 'Branch UUID where the consultation will occur',
  })
  @IsUUID()
  @IsOptional()
  branchId?: string;
}

export class ReserveBenefitSessionDto {
  @ApiProperty({
    example: 'd3b07384-d113-40e1-a20d-773c68e14674',
    description: 'PAEF Agreement UUID',
  })
  @IsUUID()
  @IsNotEmpty()
  agreementId!: string;

  @ApiProperty({
    example: 'p3b07384-d113-40e1-a20d-773c68e14674',
    description: 'Benefit Pool UUID to debit from',
  })
  @IsUUID()
  @IsNotEmpty()
  poolId!: string;

  @ApiProperty({
    example: 'e3b07384-d113-40e1-a20d-773c68e14674',
    description:
      'Employee Eligibility UUID (or ID matched from eligibility verification)',
  })
  @IsUUID()
  @IsNotEmpty()
  eligibilityId!: string;

  @ApiPropertyOptional({
    example: 'b1b07384-d113-40e1-a20d-773c68e14674',
    description: 'Branch UUID where the service is scheduled',
  })
  @IsUUID()
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({
    example: 'a1b07384-d113-40e1-a20d-773c68e14674',
    description: 'Appointment UUID linked to this booking',
  })
  @IsUUID()
  @IsOptional()
  appointmentId?: string;

  @ApiPropertyOptional({
    example: 'c1b07384-d113-40e1-a20d-773c68e14674',
    description: 'Patient UUID in clinical records',
  })
  @IsUUID()
  @IsOptional()
  patientId?: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'Number of sessions to reserve',
    default: 1,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  sessionQuantity?: number;

  @ApiPropertyOptional({
    example: 'Initial intake consultation under corporate coverage',
    description: 'Administrative or booking reason',
  })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Additional structured metadata',
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class ConfirmBenefitSessionDto {
  @ApiPropertyOptional({
    example: 'Session successfully attended and completed',
    description: 'Confirmation notes',
  })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Additional structured metadata',
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class ReleaseBenefitSessionDto {
  @ApiProperty({
    example: 'Patient cancelled appointment with >24h notice',
    description:
      'Reason for releasing or refunding the reserved/consumed session',
  })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional({
    description: 'Additional structured metadata',
  })
  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
