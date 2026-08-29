import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ScheduleSlotDto } from './schedule-slot.dto';

export class AssignProfessionalBranchDto {
  @ApiProperty({
    description: 'User UUID of the therapist/professional to assign',
    example: '23000000-0000-4000-8000-000000000001',
  })
  @IsUUID('4')
  @IsNotEmpty()
  userId: string;

  @ApiPropertyOptional({
    description: 'Whether this branch is the primary location for the professional',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({
    description: 'Initial weekly in-person schedule slots for this branch',
    type: [ScheduleSlotDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleSlotDto)
  schedules?: ScheduleSlotDto[];
}
