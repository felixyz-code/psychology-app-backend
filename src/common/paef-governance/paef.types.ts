/**
 * PAEF Governance Types for NestJS Backend
 * Corresponds to PAEF.3.3 and PAEF.4.6 specifications.
 */

export enum EffectClass {
  READ_ONLY = 'READ_ONLY',
  CANDIDATE_PRODUCING = 'CANDIDATE_PRODUCING',
  STATE_MUTATING = 'STATE_MUTATING',
  AUTHORITY_SENSITIVE = 'AUTHORITY_SENSITIVE',
}

export enum AuthorityState {
  DECISION_REQUIRED = 'DECISION_REQUIRED',
  DECISION_AVAILABLE = 'DECISION_AVAILABLE',
  DECISION_ABSENT = 'DECISION_ABSENT',
  DECISION_INVALID = 'DECISION_INVALID',
  DECISION_NOT_REQUIRED = 'DECISION_NOT_REQUIRED',
}

export interface HumanAuthorityDecision {
  decisionId: string;
  authorityIdentity: string;
  governanceBasis: string;
  targetScope: string;
  timestampUtc: string;
  isValid: boolean;
  rejectionReason?: string;
}

export interface AuthorityRequest {
  requestId: string;
  requiredSubject: string;
  requiredScope: string;
  requiredCharacteristic: string;
  blockingReason: string;
  runtimeVersion: string;
}
