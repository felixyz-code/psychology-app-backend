import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ManualTransitionDto {
  @ApiProperty({
    description: 'Subscription ID (UUID or external subscription ID)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsNotEmpty()
  @IsString()
  subscriptionId: string;

  @ApiProperty({
    enum: SubscriptionStatus,
    description: 'Target subscription status',
    example: SubscriptionStatus.ACTIVE,
  })
  @IsEnum(SubscriptionStatus)
  status: SubscriptionStatus;

  @ApiPropertyOptional({
    description: 'Administrative override reason',
    example: 'Enterprise pilot extension authorized by CS team',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
