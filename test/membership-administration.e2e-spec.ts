import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { normalizeEmailIdentity } from '../src/common/identity/email-identity.util';

const describeCertification =
  process.env.RUN_TENANT_CERTIFICATION_TESTS === 'true'
    ? describe
    : describe.skip;

describeCertification('Membership administration runtime', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let jwtService: JwtService;
  const databaseUrl = process.env.DATABASE_URL;
  const suffix = randomUUID();

  const organizationAlphaId = randomUUID();
  const organizationBetaId = randomUUID();
  const organizationSuspendedId = randomUUID();
  const organizationConcurrentId = randomUUID();

  const ownerAlphaUserId = randomUUID();
  const ownerBetaUserId = randomUUID();
  const ownerSuspendedOrgUserId = randomUUID();
  const ownerConcurrentAUserId = randomUUID();
  const ownerConcurrentBUserId = randomUUID();
  const adminUserId = randomUUID();
  const auditorUserId = randomUUID();
  const psychologistUserId = randomUUID();
  const suspendedMemberUserId = randomUUID();
  const reentryUserId = randomUUID();

  const ownerAlphaMembershipId = randomUUID();
  const ownerAlphaBetaMembershipId = randomUUID();
  const ownerBetaMembershipId = randomUUID();
  const ownerSuspendedOrgMembershipId = randomUUID();
  const ownerConcurrentAMembershipId = randomUUID();
  const ownerConcurrentBMembershipId = randomUUID();
  const adminMembershipId = randomUUID();
  const auditorMembershipId = randomUUID();
  const psychologistMembershipId = randomUUID();
  const suspendedMemberMembershipId = randomUUID();
  const reentryRevokedMembershipId = randomUUID();

  type MembershipListItem = { id: string };
  type InvitationCreateResponse = { token: string };
  type AcceptedInvitationResponse = {
    id: string;
    organizationId: string;
    role: MembershipRole;
    status: MembershipStatus;
  };

  beforeAll(async () => {
    if (
      !databaseUrl ||
      !new URL(databaseUrl).pathname.slice(1).endsWith('_test')
    ) {
      throw new Error(
        'Membership administration E2E requires DATABASE_URL ending in _test',
      );
    }

    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = 'membership-administration-jwt-key-2026';
    prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
    await prisma.$connect();

    await prisma.user.createMany({
      data: [
        user(
          ownerAlphaUserId,
          `membership-owner-alpha-${suffix}@example.test`,
          UserRole.ADMIN,
        ),
        user(
          ownerBetaUserId,
          `membership-owner-beta-${suffix}@example.test`,
          UserRole.ADMIN,
        ),
        user(
          ownerSuspendedOrgUserId,
          `membership-owner-suspended-org-${suffix}@example.test`,
          UserRole.ADMIN,
        ),
        user(
          ownerConcurrentAUserId,
          `membership-owner-concurrent-a-${suffix}@example.test`,
          UserRole.ADMIN,
        ),
        user(
          ownerConcurrentBUserId,
          `membership-owner-concurrent-b-${suffix}@example.test`,
          UserRole.ADMIN,
        ),
        user(
          adminUserId,
          `membership-admin-${suffix}@example.test`,
          UserRole.ADMIN,
        ),
        user(
          auditorUserId,
          `membership-auditor-${suffix}@example.test`,
          UserRole.ADMIN,
        ),
        user(
          psychologistUserId,
          `membership-psychologist-${suffix}@example.test`,
          UserRole.PSYCHOLOGIST,
        ),
        user(
          suspendedMemberUserId,
          `membership-suspended-${suffix}@example.test`,
          UserRole.PSYCHOLOGIST,
        ),
        user(
          reentryUserId,
          `membership-reentry-${suffix}@example.test`,
          UserRole.PSYCHOLOGIST,
        ),
      ],
    });

    await prisma.organization.createMany({
      data: [
        organization(organizationAlphaId, `membership-alpha-${suffix}`),
        organization(organizationBetaId, `membership-beta-${suffix}`),
        organization(
          organizationSuspendedId,
          `membership-suspended-${suffix}`,
          OrganizationStatus.SUSPENDED,
        ),
        organization(
          organizationConcurrentId,
          `membership-concurrent-${suffix}`,
        ),
      ],
    });

    await prisma.organizationMembership.createMany({
      data: [
        membership(
          ownerAlphaMembershipId,
          ownerAlphaUserId,
          organizationAlphaId,
          MembershipRole.OWNER,
        ),
        membership(
          ownerAlphaBetaMembershipId,
          ownerAlphaUserId,
          organizationBetaId,
          MembershipRole.OWNER,
        ),
        membership(
          ownerBetaMembershipId,
          ownerBetaUserId,
          organizationBetaId,
          MembershipRole.OWNER,
        ),
        membership(
          ownerSuspendedOrgMembershipId,
          ownerSuspendedOrgUserId,
          organizationSuspendedId,
          MembershipRole.OWNER,
        ),
        membership(
          ownerConcurrentAMembershipId,
          ownerConcurrentAUserId,
          organizationConcurrentId,
          MembershipRole.OWNER,
        ),
        membership(
          ownerConcurrentBMembershipId,
          ownerConcurrentBUserId,
          organizationConcurrentId,
          MembershipRole.OWNER,
        ),
        membership(
          adminMembershipId,
          adminUserId,
          organizationAlphaId,
          MembershipRole.ADMIN,
        ),
        membership(
          auditorMembershipId,
          auditorUserId,
          organizationAlphaId,
          MembershipRole.AUDITOR,
        ),
        membership(
          psychologistMembershipId,
          psychologistUserId,
          organizationAlphaId,
          MembershipRole.PSYCHOLOGIST,
        ),
        membership(
          suspendedMemberMembershipId,
          suspendedMemberUserId,
          organizationAlphaId,
          MembershipRole.PSYCHOLOGIST,
          MembershipStatus.SUSPENDED,
        ),
        membership(
          reentryRevokedMembershipId,
          reentryUserId,
          organizationAlphaId,
          MembershipRole.PSYCHOLOGIST,
          MembershipStatus.REVOKED,
        ),
      ],
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    jwtService = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.organizationInvitation.deleteMany({
      where: {
        organizationId: {
          in: [
            organizationAlphaId,
            organizationBetaId,
            organizationSuspendedId,
            organizationConcurrentId,
          ],
        },
      },
    });
    await prisma?.organizationMembership.deleteMany({
      where: {
        userId: {
          in: [
            ownerAlphaUserId,
            ownerBetaUserId,
            ownerSuspendedOrgUserId,
            ownerConcurrentAUserId,
            ownerConcurrentBUserId,
            adminUserId,
            auditorUserId,
            psychologistUserId,
            suspendedMemberUserId,
            reentryUserId,
          ],
        },
      },
    });
    await prisma?.organization.deleteMany({
      where: {
        id: {
          in: [
            organizationAlphaId,
            organizationBetaId,
            organizationSuspendedId,
            organizationConcurrentId,
          ],
        },
      },
    });
    await prisma?.user.deleteMany({
      where: {
        id: {
          in: [
            ownerAlphaUserId,
            ownerBetaUserId,
            ownerSuspendedOrgUserId,
            ownerConcurrentAUserId,
            ownerConcurrentBUserId,
            adminUserId,
            auditorUserId,
            psychologistUserId,
            suspendedMemberUserId,
            reentryUserId,
          ],
        },
      },
    });
    await prisma?.$disconnect();
  });

  it('enforces read boundaries, fail-closed tenant resolution, and hides revoked history from the administrative list', async () => {
    const ownerAlphaToken = bearerToken(ownerAlphaUserId, UserRole.ADMIN);
    const auditorToken = bearerToken(auditorUserId, UserRole.ADMIN);
    const psychologistToken = bearerToken(
      psychologistUserId,
      UserRole.PSYCHOLOGIST,
    );
    const suspendedMemberToken = bearerToken(
      suspendedMemberUserId,
      UserRole.PSYCHOLOGIST,
    );
    const suspendedOrgOwnerToken = bearerToken(
      ownerSuspendedOrgUserId,
      UserRole.ADMIN,
    );

    const ownerList = await request(app.getHttpServer())
      .get(`/organizations/${organizationAlphaId}/memberships`)
      .set('Authorization', ownerAlphaToken)
      .set('X-Organization-Id', organizationAlphaId)
      .expect(200);
    const ownerListBody = ownerList.body as MembershipListItem[];
    const listedIds = ownerListBody.map(
      (membership: MembershipListItem) => membership.id,
    );
    expect(listedIds).toContain(ownerAlphaMembershipId);
    expect(listedIds).toContain(adminMembershipId);
    expect(listedIds).toContain(auditorMembershipId);
    expect(listedIds).toContain(psychologistMembershipId);
    expect(listedIds).not.toContain(reentryRevokedMembershipId);

    await request(app.getHttpServer())
      .get(`/organizations/${organizationAlphaId}/memberships`)
      .set('Authorization', auditorToken)
      .set('X-Organization-Id', organizationAlphaId)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/organizations/${organizationAlphaId}/memberships`)
      .set('Authorization', psychologistToken)
      .set('X-Organization-Id', organizationAlphaId)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/organizations/${organizationBetaId}/memberships`)
      .set('Authorization', ownerAlphaToken)
      .set('X-Organization-Id', organizationAlphaId)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/organizations/${organizationAlphaId}/memberships`)
      .set('Authorization', suspendedMemberToken)
      .set('X-Organization-Id', organizationAlphaId)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/organizations/${organizationSuspendedId}/memberships`)
      .set('Authorization', suspendedOrgOwnerToken)
      .set('X-Organization-Id', organizationSuspendedId)
      .expect(403);
  });

  it('keeps ADMIN restrictions and applies a role change on the next request without minting a new JWT', async () => {
    const ownerAlphaToken = bearerToken(ownerAlphaUserId, UserRole.ADMIN);
    const adminToken = bearerToken(adminUserId, UserRole.ADMIN);

    await request(app.getHttpServer())
      .get(`/organizations/${organizationAlphaId}/memberships`)
      .set('Authorization', adminToken)
      .set('X-Organization-Id', organizationAlphaId)
      .expect(200);

    await request(app.getHttpServer())
      .patch(
        `/organizations/${organizationAlphaId}/memberships/${ownerAlphaMembershipId}/role`,
      )
      .set('Authorization', adminToken)
      .set('X-Organization-Id', organizationAlphaId)
      .send({ role: MembershipRole.BILLING })
      .expect(403);

    await request(app.getHttpServer())
      .patch(
        `/organizations/${organizationAlphaId}/memberships/${adminMembershipId}/role`,
      )
      .set('Authorization', adminToken)
      .set('X-Organization-Id', organizationAlphaId)
      .send({ role: MembershipRole.BILLING })
      .expect(403);

    await request(app.getHttpServer())
      .patch(
        `/organizations/${organizationAlphaId}/memberships/${adminMembershipId}/role`,
      )
      .set('Authorization', ownerAlphaToken)
      .set('X-Organization-Id', organizationAlphaId)
      .send({ role: MembershipRole.BILLING })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          id: adminMembershipId,
          role: MembershipRole.BILLING,
          status: MembershipStatus.ACTIVE,
        });
      });

    await request(app.getHttpServer())
      .get(`/organizations/${organizationAlphaId}/memberships`)
      .set('Authorization', adminToken)
      .set('X-Organization-Id', organizationAlphaId)
      .expect(403);
  });

  it('enforces the status allowlist and applies suspend/reactivate effects on the next request without a new JWT', async () => {
    const ownerAlphaToken = bearerToken(ownerAlphaUserId, UserRole.ADMIN);
    const psychologistToken = bearerToken(
      psychologistUserId,
      UserRole.PSYCHOLOGIST,
    );

    for (const payload of [
      {},
      { status: MembershipStatus.INVITED },
      { status: MembershipStatus.REVOKED },
      { status: 'ARCHIVED' },
    ]) {
      await request(app.getHttpServer())
        .patch(
          `/organizations/${organizationAlphaId}/memberships/${psychologistMembershipId}/status`,
        )
        .set('Authorization', ownerAlphaToken)
        .set('X-Organization-Id', organizationAlphaId)
        .send(payload)
        .expect(400);
    }

    await request(app.getHttpServer())
      .patch(
        `/organizations/${organizationAlphaId}/memberships/${psychologistMembershipId}/status`,
      )
      .set('Authorization', ownerAlphaToken)
      .set('X-Organization-Id', organizationAlphaId)
      .send({ status: MembershipStatus.SUSPENDED, ignored: true })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          id: psychologistMembershipId,
          status: MembershipStatus.SUSPENDED,
        });
      });

    const suspendedMembership =
      await prisma.organizationMembership.findUniqueOrThrow({
        where: { id: psychologistMembershipId },
        select: { status: true, suspendedAt: true, revokedAt: true },
      });
    expect(suspendedMembership.status).toBe(MembershipStatus.SUSPENDED);
    expect(suspendedMembership.suspendedAt).toBeInstanceOf(Date);
    expect(suspendedMembership.revokedAt).toBeNull();

    await request(app.getHttpServer())
      .get('/auth/context')
      .set('Authorization', psychologistToken)
      .set('X-Organization-Id', organizationAlphaId)
      .expect(403);

    await request(app.getHttpServer())
      .patch(
        `/organizations/${organizationAlphaId}/memberships/${psychologistMembershipId}/status`,
      )
      .set('Authorization', ownerAlphaToken)
      .set('X-Organization-Id', organizationAlphaId)
      .send({ status: MembershipStatus.ACTIVE })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          id: psychologistMembershipId,
          status: MembershipStatus.ACTIVE,
        });
      });

    expect(
      await prisma.organizationMembership.findUniqueOrThrow({
        where: { id: psychologistMembershipId },
        select: { status: true, suspendedAt: true },
      }),
    ).toMatchObject({
      status: MembershipStatus.ACTIVE,
      suspendedAt: null,
    });

    await request(app.getHttpServer())
      .get('/auth/context')
      .set('Authorization', psychologistToken)
      .set('X-Organization-Id', organizationAlphaId)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          status: 'RESOLVED',
          tenantContext: {
            membershipId: psychologistMembershipId,
            organizationId: organizationAlphaId,
          },
        });
      });
  });

  it('supports remove and leave while preserving the last active owner invariant', async () => {
    const ownerAlphaToken = bearerToken(ownerAlphaUserId, UserRole.ADMIN);
    const ownerBetaToken = bearerToken(ownerBetaUserId, UserRole.ADMIN);

    await request(app.getHttpServer())
      .delete(
        `/organizations/${organizationAlphaId}/memberships/${auditorMembershipId}`,
      )
      .set('Authorization', ownerAlphaToken)
      .set('X-Organization-Id', organizationAlphaId)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({
          id: auditorMembershipId,
          status: MembershipStatus.REVOKED,
        });
      });

    const removedAuditor =
      await prisma.organizationMembership.findUniqueOrThrow({
        where: { id: auditorMembershipId },
        select: { status: true, revokedAt: true },
      });
    expect(removedAuditor.status).toBe(MembershipStatus.REVOKED);
    expect(removedAuditor.revokedAt).toBeInstanceOf(Date);

    await request(app.getHttpServer())
      .post(`/organizations/${organizationBetaId}/memberships/leave`)
      .set('Authorization', ownerAlphaToken)
      .set('X-Organization-Id', organizationBetaId)
      .expect(201)
      .expect((response) => {
        expect(response.body).toEqual({
          id: ownerAlphaBetaMembershipId,
          status: MembershipStatus.REVOKED,
        });
      });

    await request(app.getHttpServer())
      .post(`/organizations/${organizationBetaId}/memberships/leave`)
      .set('Authorization', ownerBetaToken)
      .set('X-Organization-Id', organizationBetaId)
      .expect(409);
  });

  it('creates a new membership row on invitation acceptance when only revoked history exists', async () => {
    const ownerAlphaToken = bearerToken(ownerAlphaUserId, UserRole.ADMIN);
    const reentryToken = bearerToken(reentryUserId, UserRole.PSYCHOLOGIST);

    const invitation = await request(app.getHttpServer())
      .post(`/organizations/${organizationAlphaId}/invitations`)
      .set('Authorization', ownerAlphaToken)
      .set('X-Organization-Id', organizationAlphaId)
      .send({
        email: `membership-reentry-${suffix}@example.test`,
        role: MembershipRole.PSYCHOLOGIST,
      })
      .expect(201);
    const invitationBody = invitation.body as InvitationCreateResponse;
    expect(invitationBody.token).toEqual(expect.any(String));

    const accepted = await request(app.getHttpServer())
      .post(`/organization-invitations/${invitationBody.token}/accept`)
      .set('Authorization', reentryToken)
      .expect(201);
    const acceptedBody = accepted.body as AcceptedInvitationResponse;
    expect(acceptedBody).toMatchObject({
      organizationId: organizationAlphaId,
      role: MembershipRole.PSYCHOLOGIST,
      status: MembershipStatus.ACTIVE,
    });
    expect(acceptedBody.id).not.toBe(reentryRevokedMembershipId);

    const memberships = await prisma.organizationMembership.findMany({
      where: {
        organizationId: organizationAlphaId,
        userId: reentryUserId,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        status: true,
        joinedAt: true,
        revokedAt: true,
      },
    });

    expect(memberships).toHaveLength(2);
    expect(memberships[0]?.id).toBe(reentryRevokedMembershipId);
    expect(memberships[0]?.status).toBe(MembershipStatus.REVOKED);
    expect(memberships[0]?.revokedAt).toBeInstanceOf(Date);
    expect(memberships[1]?.id).toBe(acceptedBody.id);
    expect(memberships[1]?.status).toBe(MembershipStatus.ACTIVE);
    expect(memberships[1]?.joinedAt).toBeInstanceOf(Date);

    const currentList = await request(app.getHttpServer())
      .get(`/organizations/${organizationAlphaId}/memberships`)
      .set('Authorization', ownerAlphaToken)
      .set('X-Organization-Id', organizationAlphaId)
      .expect(200);
    const currentListBody = currentList.body as MembershipListItem[];
    const currentIds = currentListBody.map(
      (membership: MembershipListItem) => membership.id,
    );
    expect(currentIds).toContain(acceptedBody.id);
    expect(currentIds).not.toContain(reentryRevokedMembershipId);
  });

  it('keeps at least one active owner under concurrent owner suspension requests', async () => {
    const ownerConcurrentAToken = bearerToken(
      ownerConcurrentAUserId,
      UserRole.ADMIN,
    );
    const ownerConcurrentBToken = bearerToken(
      ownerConcurrentBUserId,
      UserRole.ADMIN,
    );

    const [responseA, responseB] = await Promise.all([
      request(app.getHttpServer())
        .patch(
          `/organizations/${organizationConcurrentId}/memberships/${ownerConcurrentAMembershipId}/status`,
        )
        .set('Authorization', ownerConcurrentAToken)
        .set('X-Organization-Id', organizationConcurrentId)
        .send({ status: MembershipStatus.SUSPENDED }),
      request(app.getHttpServer())
        .patch(
          `/organizations/${organizationConcurrentId}/memberships/${ownerConcurrentBMembershipId}/status`,
        )
        .set('Authorization', ownerConcurrentBToken)
        .set('X-Organization-Id', organizationConcurrentId)
        .send({ status: MembershipStatus.SUSPENDED }),
    ]);

    expect([responseA.status, responseB.status].sort()).toEqual([200, 409]);

    const activeOwners = await prisma.organizationMembership.count({
      where: {
        organizationId: organizationConcurrentId,
        role: MembershipRole.OWNER,
        status: MembershipStatus.ACTIVE,
      },
    });
    expect(activeOwners).toBe(1);
  });

  function bearerToken(userId: string, role: UserRole) {
    return `Bearer ${jwtService.sign({
      sub: userId,
      name: 'Membership Runtime User',
      email: 'membership-runtime@example.test',
      role,
    })}`;
  }
});

function user(id: string, email: string, role: UserRole) {
  return {
    id,
    name: 'Membership Runtime User',
    email,
    normalizedEmail: normalizeEmailIdentity(email),
    passwordHash: 'not-a-real-password',
    role,
  };
}

function organization(
  id: string,
  slug: string,
  status: OrganizationStatus = OrganizationStatus.ACTIVE,
) {
  return {
    id,
    slug,
    legalName: 'Membership Runtime Legal Name',
    displayName: 'Membership Runtime',
    status,
  };
}

function membership(
  id: string,
  userId: string,
  organizationId: string,
  role: MembershipRole,
  status: MembershipStatus = MembershipStatus.ACTIVE,
) {
  const joinedAt = new Date('2026-01-01T00:00:00.000Z');
  return {
    id,
    userId,
    organizationId,
    role,
    status,
    joinedAt: status === MembershipStatus.INVITED ? null : joinedAt,
    suspendedAt:
      status === MembershipStatus.SUSPENDED
        ? new Date('2026-01-02T00:00:00.000Z')
        : null,
    revokedAt:
      status === MembershipStatus.REVOKED
        ? new Date('2026-01-03T00:00:00.000Z')
        : null,
  };
}
