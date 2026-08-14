import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class PlanOverrideDto {
  @ApiProperty({
    description: 'Subscription ID (UUID or external subscription ID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsNotEmpty()
  @IsString()
  subscriptionId: string;

  @ApiProperty({
    description: 'Target plan code to assign (e.g. enterprise-custom, pro-monthly)',
    example: 'enterprise-custom',
  })
  @IsNotEmpty()
  @IsString()
  newPlanCode: string;
}
