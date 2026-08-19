import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty } from 'class-validator';

export class ToggleVisibilityDto {
  @ApiProperty({
    example: true,
    description:
      'Whether the instrument is enabled and visible for clinical assignment in this tenant',
  })
  @IsBoolean()
  @IsNotEmpty()
  isEnabled!: boolean;
}
