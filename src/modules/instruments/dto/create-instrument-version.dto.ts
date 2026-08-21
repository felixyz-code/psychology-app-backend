import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsNotEmpty } from 'class-validator';

export class CreateInstrumentVersionDto {
  @ApiProperty({
    description:
      'UI-independent JSON specification of items, prompts, and options',
    example: {
      schemaVersion: '1.0',
      metadata: { title: 'PHQ-9' },
      items: [],
    },
  })
  @IsObject()
  @IsNotEmpty()
  definitionJson!: Record<string, any>;

  @ApiProperty({
    description:
      'Psychometric scoring specification including subscales, cutoffs, and clinical alerts',
    example: {
      schemaVersion: '1.0',
      scoringType: 'SUM',
      strata: [],
      clinicalAlerts: [],
    },
  })
  @IsObject()
  @IsNotEmpty()
  scoringSpecJson!: Record<string, any>;
}
