import { BadRequestException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';

export enum InvitationLogicalStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  REVOKED = 'REVOKED',
  EXPIRED = 'EXPIRED',
}

export type InvitationLifecycleSnapshot = {
  expiresAt: Date;
  acceptedAt: Date | null;
  rejectedAt: Date | null;
  revokedAt: Date | null;
  expiredAt: Date | null;
};

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function normalizeInvitationEmail(email: string) {
  return email.trim().toLocaleLowerCase('en-US');
}

export function deriveInvitationLogicalStatus(
  invitation: InvitationLifecycleSnapshot,
  now: Date = new Date(),
) {
  if (invitation.acceptedAt) return InvitationLogicalStatus.ACCEPTED;
  if (invitation.rejectedAt) return InvitationLogicalStatus.REJECTED;
  if (invitation.revokedAt) return InvitationLogicalStatus.REVOKED;
  if (invitation.expiredAt) return InvitationLogicalStatus.EXPIRED;
  if (invitation.expiresAt <= now) return InvitationLogicalStatus.EXPIRED;
  return InvitationLogicalStatus.PENDING;
}

export function countTerminalInvitationStates(
  invitation: InvitationLifecycleSnapshot,
) {
  return [
    invitation.acceptedAt,
    invitation.rejectedAt,
    invitation.revokedAt,
    invitation.expiredAt,
  ].filter(Boolean).length;
}

export function generateInvitationToken() {
  return randomBytes(32).toString('base64url');
}

export function digestInvitationToken(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function digestValidatedInvitationToken(token: string) {
  if (!TOKEN_PATTERN.test(token))
    throw new BadRequestException('Invalid invitation token');
  return digestInvitationToken(token);
}
