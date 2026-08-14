import { SetMetadata } from '@nestjs/common';
import { EntitlementKey, REQUIRE_FEATURE_KEY } from '../entitlements.constants';

export const RequireFeature = (featureKey: EntitlementKey | string) =>
  SetMetadata<string, string>(REQUIRE_FEATURE_KEY, featureKey);
