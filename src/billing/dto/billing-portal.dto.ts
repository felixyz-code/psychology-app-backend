import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUrl } from 'class-validator';

export class CreatePortalSessionDto {
  @ApiPropertyOptional({
    description: 'URL to return to after managing subscription in the portal',
    example: 'https://app.psicologia.com/billing',
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  returnUrl?: string;
}

export class PortalSessionResponseDto {
  @ApiProperty({
    description: 'Stripe Billing Portal URL',
    example: 'https://billing.stripe.com/p/session/portal_test_123',
  })
  url!: string;
}
