import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { TenantObservabilityService } from '../src/tenant-context/tenant-observability.service';

const describeCertification =
  process.env.RUN_TENANT_CERTIFICATION_TESTS === 'true'
    ? describe
    : describe.skip;

jest.setTimeout(60_000);

describeCertification('Invitation administration concurrency runtime', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let jwtService: JwtService;
  let moduleRef: TestingModule;
  let observability: TenantObservabilityService;
  let eventSpy: jest.SpyInstance;
  let activeLockRelease: null | (() => Promise<void>) = null;
  const databaseUrl = process.env.DATABASE_URL;
  const suffix = randomUUID();

  const organizationId = randomUUID();
  const ownerUserId = randomUUID();
  const adminUserId = randomUUID();
  const recipientUserId = randomUUID();

  const ownerMembershipId = randomUUID();
  const adminMembershipId = randomUUID();

  const recipientEmail = `invitation-race-${suffix}@example.test`;

  beforeAll(async () => {
    if (
      !databaseUrl ||
      !new URL(databaseUrl).pathname.slice(1).endsWith('_test')
    ) {
      throw new Error(
        'Invitation administration concurrency E2E requires DATABASE_URL ending in _test',
      );
    }

    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = 'invitation-concurrency-jwt-key-2026';
    prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
    await prisma.$connect();

    await prisma.user.createMany({
      data: [
        user(
          ownerUserId,
          `invitation-owner-${suffix}@example.test`,
          UserRole.ADMIN,
        ),
        user(
          adminUserId,
          `invitation-admin-${suffix}@example.test`,
          UserRole.ADMIN,
        ),
        user(recipientUserId, recipientEmail, UserRole.ADMIN),
      ],
    });

    await prisma.organization.create({
      data: organization(organizationId, `invitation-race-${suffix}`),
    });

    await prisma.organizationMembership.createMany({
      data: [
        membership(
          ownerMembershipId,
          ownerUserId,
          organizationId,
          MembershipRole.OWNER,
        ),
        membership(
          adminMembershipId,
          adminUserId,
          organizationId,
          MembershipRole.ADMIN,
        ),
      ],
    });

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    jwtService = moduleRef.get(JwtService);
    observability = moduleRef.get(TenantObservabilityService);
    eventSpy = jest.spyOn(observability, 'organizationDomainEvent');
  });

  afterEach(async () => {
    if (activeLockRelease) {
      await activeLockRelease();
      activeLockRelease = null;
    }
    eventSpy.mockClear();
    await prisma.organizationInvitation.deleteMany({
      where: { organizationId },
    });
    await prisma.organizationMembership.deleteMany({
      where: {
        organizationId,
        userId: recipientUserId,
      },
    });
  });

  afterAll(async () => {
    if (activeLockRelease) {
      await activeLockRelease();
      activeLockRelease = null;
    }
    eventSpy.mockRestore();
    await app?.close();
    await prisma?.organizationInvitation.deleteMany({
      where: { organizationId },
    });
    await prisma?.organizationMembership.deleteMany({
      where: {
        id: { in: [ownerMembershipId, adminMembershipId] },
      },
    });
    await prisma?.organization.deleteMany({ where: { id: organizationId } });
    await prisma?.user.deleteMany({
      where: { id: { in: [ownerUserId, adminUserId, recipientUserId] } },
    });
    await prisma?.$disconnect();
  });

  it('keeps exactly one pending invitation under concurrent create requests', async () => {
    const email = `create-race-${randomUUID()}@example.test`;
    const release = await lockInvitationTable();

    const ownerRequest = trackRequest(
      request(app.getHttpServer())
        .post(`/organizations/${organizationId}/invitations`)
        .set('Authorization', bearerToken(ownerUserId, UserRole.ADMIN))
        .set('X-Organization-Id', organizationId)
        .send({ email, role: MembershipRole.PSYCHOLOGIST }),
    );
    const adminRequest = trackRequest(
      request(app.getHttpServer())
        .post(`/organizations/${organizationId}/invitations`)
        .set('Authorization', bearerToken(adminUserId, UserRole.ADMIN))
        .set('X-Organization-Id', organizationId)
        .send({ email, role: MembershipRole.PSYCHOLOGIST }),
    );

    await expectBothPending(ownerRequest, adminRequest);
    await release();

    const [ownerResponse, adminResponse] = await Promise.all([
      ownerRequest.promise,
      adminRequest.promise,
    ]);
    expect([ownerResponse.status, adminResponse.status].sort()).toEqual([
      201, 409,
    ]);
    expect(
      await prisma.organizationInvitation.count({
        where: {
          organizationId,
          normalizedEmail: email,
          acceptedAt: null,
          rejectedAt: null,
          revokedAt: null,
          expiredAt: null,
        },
      }),
    ).toBe(1);
  });

  it('accepts exactly once under concurrent accept requests', async () => {
    const invitation = await createInvitation(recipientEmail);
    eventSpy.mockClear();
    const release = await lockInvitationTable();

    const requestA = trackRequest(
      request(app.getHttpServer())
        .post(`/organization-invitations/${invitation.token}/accept`)
        .set('Authorization', bearerToken(recipientUserId, UserRole.ADMIN)),
    );
    const requestB = trackRequest(
      request(app.getHttpServer())
        .post(`/organization-invitations/${invitation.token}/accept`)
        .set('Authorization', bearerToken(recipientUserId, UserRole.ADMIN)),
    );

    await expectBothPending(requestA, requestB);
    await release();

    const [responseA, responseB] = await Promise.all([
      requestA.promise,
      requestB.promise,
    ]);
    expect([responseA.status, responseB.status].sort()).toEqual([201, 409]);
    expect(
      await prisma.organizationMembership.count({
        where: {
          organizationId,
          userId: recipientUserId,
          status: MembershipStatus.ACTIVE,
        },
      }),
    ).toBe(1);
    expect(successEventCount('invitation_accepted')).toBe(1);
  });

  it('keeps exactly one terminal transition under concurrent accept and reject requests', async () => {
    const invitation = await createInvitation(recipientEmail);
    eventSpy.mockClear();
    const release = await lockInvitationTable();

    const acceptRequest = trackRequest(
      request(app.getHttpServer())
        .post(`/organization-invitations/${invitation.token}/accept`)
        .set('Authorization', bearerToken(recipientUserId, UserRole.ADMIN)),
    );
    const rejectRequest = trackRequest(
      request(app.getHttpServer())
        .post(`/organization-invitations/${invitation.token}/reject`)
        .set('Authorization', bearerToken(recipientUserId, UserRole.ADMIN)),
    );

    await expectBothPending(acceptRequest, rejectRequest);
    await release();

    const [acceptResponse, rejectResponse] = await Promise.all([
      acceptRequest.promise,
      rejectRequest.promise,
    ]);
    expect([acceptResponse.status, rejectResponse.status].sort()).toEqual([
      201, 409,
    ]);

    const persisted = await prisma.organizationInvitation.findUniqueOrThrow({
      where: { id: invitation.id },
      select: { acceptedAt: true, rejectedAt: true, revokedAt: true },
    });
    const activeMemberships = await prisma.organizationMembership.count({
      where: {
        organizationId,
        userId: recipientUserId,
        status: MembershipStatus.ACTIVE,
      },
    });

    if (persisted.acceptedAt) {
      expect(persisted.rejectedAt).toBeNull();
      expect(persisted.revokedAt).toBeNull();
      expect(activeMemberships).toBe(1);
      expect(successEventCount('invitation_accepted')).toBe(1);
      expect(successEventCount('invitation_rejected')).toBe(0);
    } else {
      expect(persisted.acceptedAt).toBeNull();
      expect(persisted.rejectedAt).toBeInstanceOf(Date);
      expect(persisted.revokedAt).toBeNull();
      expect(activeMemberships).toBe(0);
      expect(successEventCount('invitation_accepted')).toBe(0);
      expect(successEventCount('invitation_rejected')).toBe(1);
    }
  });

  it('keeps accept and revoke mutually exclusive under overlap', async () => {
    const invitation = await createInvitation(recipientEmail);
    eventSpy.mockClear();
    const release = await lockInvitationTable();

    const acceptRequest = trackRequest(
      request(app.getHttpServer())
        .post(`/organization-invitations/${invitation.token}/accept`)
        .set('Authorization', bearerToken(recipientUserId, UserRole.ADMIN)),
    );
    const revokeRequest = trackRequest(
      request(app.getHttpServer())
        .post(
          `/organizations/${organizationId}/invitations/${invitation.id}/revoke`,
        )
        .set('Authorization', bearerToken(ownerUserId, UserRole.ADMIN))
        .set('X-Organization-Id', organizationId),
    );

    await expectBothPending(acceptRequest, revokeRequest);
    await release();

    const [acceptResponse, revokeResponse] = await Promise.all([
      acceptRequest.promise,
      revokeRequest.promise,
    ]);
    expect([
      [201, 409],
      [409, 200],
    ]).toContainEqual([acceptResponse.status, revokeResponse.status]);

    const persisted = await prisma.organizationInvitation.findUniqueOrThrow({
      where: { id: invitation.id },
      select: { acceptedAt: true, revokedAt: true, rejectedAt: true },
    });
    const activeMemberships = await prisma.organizationMembership.count({
      where: {
        organizationId,
        userId: recipientUserId,
        status: MembershipStatus.ACTIVE,
      },
    });

    if (persisted.acceptedAt) {
      expect(persisted.revokedAt).toBeNull();
      expect(activeMemberships).toBe(1);
      expect(successEventCount('invitation_accepted')).toBe(1);
      expect(successEventCount('invitation_revoked')).toBe(0);
    } else {
      expect(persisted.acceptedAt).toBeNull();
      expect(persisted.revokedAt).toBeInstanceOf(Date);
      expect(persisted.rejectedAt).toBeNull();
      expect(activeMemberships).toBe(0);
      expect(successEventCount('invitation_accepted')).toBe(0);
      expect(successEventCount('invitation_revoked')).toBe(1);
    }
  });

  it('invalidates the old token when resend wins against accept', async () => {
    const invitation = await createInvitation(recipientEmail);
    eventSpy.mockClear();
    const release = await lockInvitationTable();

    const acceptRequest = trackRequest(
      request(app.getHttpServer())
        .post(`/organization-invitations/${invitation.token}/accept`)
        .set('Authorization', bearerToken(recipientUserId, UserRole.ADMIN)),
    );
    const resendRequest = trackRequest(
      request(app.getHttpServer())
        .post(
          `/organizations/${organizationId}/invitations/${invitation.id}/resend`,
        )
        .set('Authorization', bearerToken(ownerUserId, UserRole.ADMIN))
        .set('X-Organization-Id', organizationId),
    );

    await expectBothPending(acceptRequest, resendRequest);
    await release();

    const [acceptResponse, resendResponse] = await Promise.all([
      acceptRequest.promise,
      resendRequest.promise,
    ]);
    expect([acceptResponse.status, resendResponse.status].sort()).toEqual([
      201, 409,
    ]);

    const invitations = await prisma.organizationInvitation.findMany({
      where: {
        organizationId,
        normalizedEmail: recipientEmail,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        acceptedAt: true,
        revokedAt: true,
        rejectedAt: true,
        expiredAt: true,
      },
    });
    const activeMemberships = await prisma.organizationMembership.count({
      where: {
        organizationId,
        userId: recipientUserId,
        status: MembershipStatus.ACTIVE,
      },
    });

    if (invitations.length === 1) {
      expect(invitations[0]?.acceptedAt).toBeInstanceOf(Date);
      expect(invitations[0]?.revokedAt).toBeNull();
      expect(activeMemberships).toBe(1);
      expect(successEventCount('invitation_accepted')).toBe(1);
      expect(successEventCount('invitation_resent')).toBe(0);
    } else {
      expect(invitations).toHaveLength(2);
      expect(invitations[0]?.revokedAt).toBeInstanceOf(Date);
      expect(invitations[0]?.acceptedAt).toBeNull();
      expect(invitations[1]?.acceptedAt).toBeNull();
      expect(invitations[1]?.revokedAt).toBeNull();
      expect(invitations[1]?.rejectedAt).toBeNull();
      expect(invitations[1]?.expiredAt).toBeNull();
      expect(activeMemberships).toBe(0);
      expect(successEventCount('invitation_accepted')).toBe(0);
      expect(successEventCount('invitation_resent')).toBe(1);
    }
  });

  it('produces one replacement under concurrent resend requests', async () => {
    const invitation = await createInvitation(recipientEmail);
    eventSpy.mockClear();
    const release = await lockInvitationTable();

    const requestA = trackRequest(
      request(app.getHttpServer())
        .post(
          `/organizations/${organizationId}/invitations/${invitation.id}/resend`,
        )
        .set('Authorization', bearerToken(ownerUserId, UserRole.ADMIN))
        .set('X-Organization-Id', organizationId),
    );
    const requestB = trackRequest(
      request(app.getHttpServer())
        .post(
          `/organizations/${organizationId}/invitations/${invitation.id}/resend`,
        )
        .set('Authorization', bearerToken(ownerUserId, UserRole.ADMIN))
        .set('X-Organization-Id', organizationId),
    );

    await expectBothPending(requestA, requestB);
    await release();

    const [responseA, responseB] = await Promise.all([
      requestA.promise,
      requestB.promise,
    ]);
    expect([responseA.status, responseB.status].sort()).toEqual([201, 409]);

    const invitations = await prisma.organizationInvitation.findMany({
      where: {
        organizationId,
        normalizedEmail: recipientEmail,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        revokedAt: true,
        acceptedAt: true,
        rejectedAt: true,
        expiredAt: true,
      },
    });

    expect(invitations).toHaveLength(2);
    expect(invitations[0]?.revokedAt).toBeInstanceOf(Date);
    expect(
      invitations.filter(
        (entry) =>
          !entry.acceptedAt &&
          !entry.rejectedAt &&
          !entry.revokedAt &&
          !entry.expiredAt,
      ),
    ).toHaveLength(1);
    expect(successEventCount('invitation_resent')).toBe(1);
  });

  async function createInvitation(email: string) {
    const response = await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/invitations`)
      .set('Authorization', bearerToken(ownerUserId, UserRole.ADMIN))
      .set('X-Organization-Id', organizationId)
      .send({ email, role: MembershipRole.PSYCHOLOGIST })
      .expect(201);

    return response.body as { id: string; token: string };
  }

  async function lockInvitationTable() {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query('BEGIN');
    await client.query(
      'LOCK TABLE organization_invitations IN ACCESS EXCLUSIVE MODE',
    );

    const release = async () => {
      await client.query('ROLLBACK');
      await client.end();
      if (activeLockRelease === release) {
        activeLockRelease = null;
      }
    };

    activeLockRelease = release;
    return release;
  }

  async function expectBothPending(
    first: { isSettled: () => boolean },
    second: { isSettled: () => boolean },
  ) {
    await delay(150);
    expect(first.isSettled()).toBe(false);
    expect(second.isSettled()).toBe(false);
  }

  function successEventCount(eventName: string) {
    return eventSpy.mock.calls.filter(
      ([event, , outcome]) => event === eventName && outcome === 'SUCCESS',
    ).length;
  }

  function bearerToken(userId: string, role: UserRole) {
    return `Bearer ${jwtService.sign({
      sub: userId,
      name: 'Invitation Concurrency User',
      email: 'invitation-concurrency@example.test',
      role,
    })}`;
  }
});

function trackRequest<T>(promise: PromiseLike<T>) {
  let settled = false;
  const trackedPromise = Promise.resolve(promise).finally(() => {
    settled = true;
  });

  return {
    promise: trackedPromise,
    isSettled: () => settled,
  };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function user(id: string, email: string, role: UserRole) {
  return {
    id,
    name: 'Invitation Concurrency User',
    email,
    passwordHash: 'not-a-real-password',
    role,
  };
}

function organization(id: string, slug: string) {
  return {
    id,
    slug,
    legalName: 'Invitation Concurrency Legal Name',
    displayName: 'Invitation Concurrency',
    status: OrganizationStatus.ACTIVE,
  };
}

function membership(
  id: string,
  userId: string,
  organizationId: string,
  role: MembershipRole,
) {
  return {
    id,
    userId,
    organizationId,
    role,
    status: MembershipStatus.ACTIVE,
    joinedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}
