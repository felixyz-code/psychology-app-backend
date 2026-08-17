import { PartialType } from '@nestjs/swagger';
import { CreatePaefAgreementDto } from './create-paef-agreement.dto';

export class UpdatePaefAgreementDto extends PartialType(
  CreatePaefAgreementDto,
) {}
