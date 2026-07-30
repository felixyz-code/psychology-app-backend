import {
  InvitationLogicalStatus,
  deriveInvitationLogicalStatus,
} from './invitation-runtime';

describe('invitation runtime helpers', () => {
  const base = {
    expiresAt: new Date('2026-08-05T00:00:00.000Z'),
    acceptedAt: null,
    rejectedAt: null,
    revokedAt: null,
    expiredAt: null,
  };

  it('derives PENDING when the invitation has no terminal timestamp and is still within TTL', () => {
    expect(
      deriveInvitationLogicalStatus(base, new Date('2026-08-01T00:00:00.000Z')),
    ).toBe(InvitationLogicalStatus.PENDING);
  });

  it('derives ACCEPTED with highest precedence', () => {
    expect(
      deriveInvitationLogicalStatus(
        {
          ...base,
          acceptedAt: new Date('2026-08-02T00:00:00.000Z'),
          rejectedAt: new Date('2026-08-03T00:00:00.000Z'),
          revokedAt: new Date('2026-08-04T00:00:00.000Z'),
          expiredAt: new Date('2026-08-05T00:00:00.000Z'),
        },
        new Date('2026-08-06T00:00:00.000Z'),
      ),
    ).toBe(InvitationLogicalStatus.ACCEPTED);
  });

  it('derives REJECTED ahead of REVOKED and EXPIRED', () => {
    expect(
      deriveInvitationLogicalStatus(
        {
          ...base,
          rejectedAt: new Date('2026-08-03T00:00:00.000Z'),
          revokedAt: new Date('2026-08-04T00:00:00.000Z'),
          expiredAt: new Date('2026-08-05T00:00:00.000Z'),
        },
        new Date('2026-08-06T00:00:00.000Z'),
      ),
    ).toBe(InvitationLogicalStatus.REJECTED);
  });

  it('derives REVOKED ahead of EXPIRED', () => {
    expect(
      deriveInvitationLogicalStatus(
        {
          ...base,
          revokedAt: new Date('2026-08-04T00:00:00.000Z'),
          expiredAt: new Date('2026-08-05T00:00:00.000Z'),
        },
        new Date('2026-08-06T00:00:00.000Z'),
      ),
    ).toBe(InvitationLogicalStatus.REVOKED);
  });

  it('derives EXPIRED from persisted expiredAt', () => {
    expect(
      deriveInvitationLogicalStatus(
        {
          ...base,
          expiredAt: new Date('2026-08-05T00:00:00.000Z'),
        },
        new Date('2026-08-06T00:00:00.000Z'),
      ),
    ).toBe(InvitationLogicalStatus.EXPIRED);
  });

  it('derives EXPIRED lazily from expiresAt when no terminal timestamp exists', () => {
    expect(
      deriveInvitationLogicalStatus(base, new Date('2026-08-06T00:00:00.000Z')),
    ).toBe(InvitationLogicalStatus.EXPIRED);
  });
});
