import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { ScheduleSlotDto } from './schedule-slot.dto';

export class UpdateProfessionalScheduleDto {
  @ApiProperty({
    description:
      'Weekly in-person schedule slots. Overwrites all existing schedule slots for this professional in the branch.',
    type: [ScheduleSlotDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleSlotDto)
  schedules: ScheduleSlotDto[];
}
