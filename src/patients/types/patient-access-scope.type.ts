import type { MembershipRole, UserRole } from '@prisma/client';
import type { TenantResolutionMode } from '../../common/request-context/request-context.service';

/**
 * Immutable, request-validated boundary for tenant-aware Patients operations.
 * The tenant guard has already validated active membership and organization.
 */
export type PatientAccessScope = Readonly<{
  organizationId: string;
  membershipId: string;
  organizationRole: MembershipRole;
  userId: string;
  legacyUserRole: UserRole;
  resolutionMode: TenantResolutionMode;
}>;
