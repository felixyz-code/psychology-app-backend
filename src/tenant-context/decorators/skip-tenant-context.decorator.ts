import { SetMetadata } from '@nestjs/common';
import { SKIP_TENANT_CONTEXT_KEY } from '../tenant-context.constants';

/** Explicitly bypasses tenant resolution for a public or infrastructure route. */
export const SkipTenantContext = () =>
  SetMetadata(SKIP_TENANT_CONTEXT_KEY, true);
