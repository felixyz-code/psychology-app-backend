import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateCheckoutSessionDto {
  @ApiProperty({
    description: 'Stripe Price ID to subscribe to (e.g. price_1N...)',
    example: 'price_starter_monthly_mxn',
  })
  @IsString()
  @IsNotEmpty()
  priceId!: string;

  @ApiPropertyOptional({
    description: 'URL to redirect after successful checkout',
    example: 'https://app.psicologia.com/billing?success=true',
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  successUrl?: string;

  @ApiPropertyOptional({
    description: 'URL to redirect if checkout is cancelled',
    example: 'https://app.psicologia.com/billing?canceled=true',
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  cancelUrl?: string;
}

export class CheckoutSessionResponseDto {
  @ApiProperty({
    description: 'Stripe Checkout Session URL',
    example: 'https://checkout.stripe.com/c/pay/cs_test_123',
  })
  url!: string;

  @ApiProperty({
    description: 'Stripe Checkout Session ID',
    example: 'cs_test_123',
  })
  sessionId!: string;
}
