import { PartialType } from '@nestjs/swagger';
import { CreateCorporateClientDto } from './create-corporate-client.dto';

export class UpdateCorporateClientDto extends PartialType(
  CreateCorporateClientDto,
) {}
