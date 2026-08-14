import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class ReconcileUploadsDto {
  @ApiPropertyOptional({
    description:
      'If true, only scan and report anomalies without deleting orphaned files or ghost DB records. Defaults to true.',
    default: true,
    example: true,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true || value === 1 || value === '1') {
      return true;
    }
    if (value === 'false' || value === false || value === 0 || value === '0') {
      return false;
    }
    return Boolean(value);
  })
  @IsBoolean()
  dryRun?: boolean = true;
}
