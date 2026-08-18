import type { MembershipRole, UserRole } from '@prisma/client';
import type { TenantResolutionMode } from '../common/request-context/request-context.service';

export type ClinicalAccessScope = Readonly<{
  organizationId: string;
  membershipId: string;
  organizationRole: MembershipRole;
  userId: string;
  legacyUserRole: UserRole;
  resolutionMode: TenantResolutionMode;
}>;
