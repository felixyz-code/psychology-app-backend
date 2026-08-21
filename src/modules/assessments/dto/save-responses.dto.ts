import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject } from 'class-validator';

export class SaveResponsesDto {
  @ApiProperty({
    example: {
      PHQ9_1: 2,
      PHQ9_2: 1,
      PHQ9_9: 0,
    },
    description:
      'Map of item codes to their answered values (scalar, numeric or array of values)',
  })
  @IsObject()
  @IsNotEmpty()
  responses!: Record<string, string | number | boolean | string[] | null>;
}
