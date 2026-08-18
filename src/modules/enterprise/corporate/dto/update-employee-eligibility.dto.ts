import { PartialType } from '@nestjs/swagger';
import { CreateEmployeeEligibilityDto } from './create-employee-eligibility.dto';

export class UpdateEmployeeEligibilityDto extends PartialType(
  CreateEmployeeEligibilityDto,
) {}
