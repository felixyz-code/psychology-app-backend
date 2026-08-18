import { TenantContext } from '../common/request-context/request-context.service';

export type { TenantContext };

export enum TenantResolutionFailure {
  NO_ACTIVE_MEMBERSHIP = 'NO_ACTIVE_MEMBERSHIP',
  AMBIGUOUS_MEMBERSHIPS = 'AMBIGUOUS_MEMBERSHIPS',
  INELIGIBLE_ORGANIZATION = 'INELIGIBLE_ORGANIZATION',
}

export type TenantResolution =
  | { tenantContext: TenantContext; failure?: never }
  | { tenantContext?: never; failure: TenantResolutionFailure };
