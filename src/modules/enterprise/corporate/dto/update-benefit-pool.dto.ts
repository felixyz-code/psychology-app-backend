import { PartialType } from '@nestjs/swagger';
import { CreateBenefitPoolDto } from './create-benefit-pool.dto';

export class UpdateBenefitPoolDto extends PartialType(CreateBenefitPoolDto) {}
