import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';

export class PublishInstrumentVersionDto {
  @ApiPropertyOptional({
    description: 'Confirm transition to immutable PUBLISHED status',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  confirmPublish?: boolean;
}
