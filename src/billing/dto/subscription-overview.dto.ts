import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BillingInterval, PlanTier, SubscriptionStatus } from '@prisma/client';

export class PlanQuotaDto {
  @ApiProperty({ example: 3 })
  maxTherapists!: number;

  @ApiProperty({ example: 2 })
  maxBranches!: number;

  @ApiProperty({ example: 500 })
  maxNotificationsPerMonth!: number;

  @ApiPropertyOptional({ example: 500 })
  maxPatients?: number | null;

  @ApiProperty({ example: true })
  canCustomBrand!: boolean;

  @ApiProperty({ example: true })
  canTeleconsultation!: boolean;
}

export class OrganizationUsageDto {
  @ApiProperty({ example: 2, description: 'Number of active therapists in organization' })
  therapistsCount!: number;

  @ApiProperty({ example: 1, description: 'Number of active branches in organization' })
  branchesCount!: number;

  @ApiProperty({ example: 45, description: 'Number of notifications sent in the current billing period' })
  notificationsCount!: number;

  @ApiPropertyOptional({ example: '2026-08-01T00:00:00.000Z' })
  periodStart?: Date;

  @ApiPropertyOptional({ example: '2026-08-31T23:59:59.999Z' })
  periodEnd?: Date;
}

export class PlanDetailDto {
  @ApiProperty({ example: '32000000-0000-4000-8000-000000000002' })
  id!: string;

  @ApiProperty({ enum: PlanTier, example: PlanTier.PRO })
  tier!: PlanTier;

  @ApiProperty({ example: 'pro-monthly' })
  code!: string;

  @ApiProperty({ example: 'Pro Plan' })
  name!: string;

  @ApiPropertyOptional({ example: 'Para pequeños consultorios y equipos de hasta 3 terapeutas' })
  description?: string | null;

  @ApiProperty({ enum: BillingInterval, example: BillingInterval.MONTHLY })
  billingInterval!: BillingInterval;

  @ApiProperty({ example: '999.00' })
  basePrice!: string;

  @ApiProperty({ example: 'MXN' })
  currency!: string;

  @ApiPropertyOptional({ example: 'price_1N...' })
  stripePriceId?: string | null;
}

export class SubscriptionOverviewResponseDto {
  @ApiProperty({ example: 'sub-uuid-123' })
  id!: string;

  @ApiProperty({ example: 'org-uuid-123' })
  organizationId!: string;

  @ApiProperty({ enum: SubscriptionStatus, example: SubscriptionStatus.ACTIVE })
  status!: SubscriptionStatus;

  @ApiPropertyOptional({ example: 'cus_123456' })
  stripeCustomerId?: string | null;

  @ApiPropertyOptional({ example: 'sub_123456' })
  stripeSubscriptionId?: string | null;

  @ApiPropertyOptional({ example: 'price_123456' })
  stripePriceId?: string | null;

  @ApiProperty({ example: false })
  cancelAtPeriodEnd!: boolean;

  @ApiProperty({ example: '2026-08-01T00:00:00.000Z' })
  currentPeriodStart!: Date;

  @ApiProperty({ example: '2026-08-31T23:59:59.999Z' })
  currentPeriodEnd!: Date;

  @ApiPropertyOptional({ example: '2026-09-07T23:59:59.999Z', description: 'Expiration date of the grace period if subscription is PAST_DUE' })
  gracePeriodEndsAt?: Date | null;

  @ApiPropertyOptional({ example: false, description: 'Indicates whether the organization is currently operating within an active grace period' })
  isGracePeriod?: boolean;

  @ApiProperty({ type: () => PlanDetailDto })
  plan!: PlanDetailDto;

  @ApiProperty({ type: () => PlanQuotaDto })
  quotas!: PlanQuotaDto;

  @ApiProperty({ type: () => OrganizationUsageDto })
  usage!: OrganizationUsageDto;
}
