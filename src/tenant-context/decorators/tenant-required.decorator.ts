import { SetMetadata } from '@nestjs/common';
import { TENANT_REQUIRED_KEY } from '../tenant-context.constants';

/** Marks an authenticated route as requiring a previously resolved tenant. */
export const TenantRequired = () => SetMetadata(TENANT_REQUIRED_KEY, true);
