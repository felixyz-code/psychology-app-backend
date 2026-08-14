import { SetMetadata } from '@nestjs/common';
import { EntitlementKey, REQUIRE_QUOTA_KEY } from '../entitlements.constants';
import { QuotaRequirement } from '../entitlements.types';

export const CheckQuota = (
  quotaKey: EntitlementKey | string,
  options?: { increment?: number },
) =>
  SetMetadata<string, QuotaRequirement>(REQUIRE_QUOTA_KEY, {
    quotaKey,
    increment: options?.increment ?? 1,
  });
