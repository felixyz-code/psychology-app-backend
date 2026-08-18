import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class ExtendTrialDto {
  @ApiProperty({
    description: 'Subscription ID (UUID or external subscription ID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsNotEmpty()
  @IsString()
  subscriptionId: string;

  @ApiProperty({
    description: 'Number of days to add to the trial period',
    example: 14,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  daysToAdd: number;
}
