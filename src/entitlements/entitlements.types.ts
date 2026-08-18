import { PlanTier, SubscriptionStatus } from '@prisma/client';

export interface QuotaCheckResult {
  allowed: boolean;
  quotaKey: string;
  limit: number;
  currentUsage: number;
  remaining: number;
  isUnlimited: boolean;
}

export interface FeatureCheckResult {
  allowed: boolean;
  featureKey: string;
  planTier?: PlanTier;
}

export interface ResolvedSubscriptionContext {
  organizationId: string;
  subscriptionId?: string;
  planId: string;
  planCode: string;
  planTier: PlanTier;
  status: SubscriptionStatus;
  isGracePeriod: boolean;
}

export interface QuotaRequirement {
  quotaKey: string;
  increment?: number;
}
