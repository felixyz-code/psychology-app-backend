import { SetMetadata } from '@nestjs/common';
import { OrganizationCapability } from './organization-capability';

export const REQUIRED_CAPABILITIES_KEY = 'requiredOrganizationCapabilities';

/** Marks a future tenant-aware route for an explicit, unconditional policy. */
export const RequireCapabilities = (
  ...capabilities: OrganizationCapability[]
) => SetMetadata(REQUIRED_CAPABILITIES_KEY, Object.freeze([...capabilities]));
