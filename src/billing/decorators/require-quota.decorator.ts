import { SetMetadata } from '@nestjs/common';
import { QuotaResource } from '../exceptions/quota-exceeded.exception';

export const REQUIRE_QUOTA_KEY = 'REQUIRE_QUOTA_KEY';

export const RequireQuota = (
  resource: QuotaResource | 'THERAPISTS' | 'BRANCHES' | 'NOTIFICATIONS',
) => SetMetadata(REQUIRE_QUOTA_KEY, resource);
