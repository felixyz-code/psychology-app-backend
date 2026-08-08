import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601 } from 'class-validator';

export class MembershipMutationPreconditionDto {
  @ApiProperty({
    format: 'date-time',
    description:
      'Canonical membership updatedAt value observed before the mutation.',
  })
  @IsISO8601({ strict: true })
  expectedUpdatedAt: string;
}
