import { SetMetadata } from '@nestjs/common';
import { OrganizationStatus } from '@prisma/client';
import { ALLOWED_ORGANIZATION_STATUSES_KEY } from '../tenant-context.constants';

/**
 * Narrows tenant resolution to the organization states a route explicitly
 * allows once membership and capability checks still pass.
 */
export const AllowedOrganizationStatuses = (
  ...statuses: OrganizationStatus[]
) => SetMetadata(ALLOWED_ORGANIZATION_STATUSES_KEY, statuses);
