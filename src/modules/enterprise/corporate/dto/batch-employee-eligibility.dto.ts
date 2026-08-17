import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateEmployeeEligibilityDto } from './create-employee-eligibility.dto';

export class BatchEmployeeEligibilityDto {
  @ApiProperty({
    type: [CreateEmployeeEligibilityDto],
    description: 'Array of employee eligibility records to import',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateEmployeeEligibilityDto)
  employees!: CreateEmployeeEligibilityDto[];
}
