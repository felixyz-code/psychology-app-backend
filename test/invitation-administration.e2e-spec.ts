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
import { normalizeInvitationEmail } from '../src/organizations/invitation-runtime';

const describeCertification =
  process.env.RUN_TENANT_CERTIFICATION_TESTS === 'true'
    ? describe
    : describe.skip;

describeCertification('Invitation administration runtime', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let jwtService: JwtService;
  const databaseUrl = process.env.DATABASE_URL;
  const suffix = randomUUID();

  const organizationAlphaId = randomUUID();
  const organizationBetaId = randomUUID();
  const organizationSuspendedId = randomUUID();

  const ownerAlphaUserId = randomUUID();
  const ownerBetaUserId = randomUUID();
  const ownerSuspendedUserId = randomUUID();
  const adminAlphaUserId = randomUUID();
  const psychologistAlphaUserId = randomUUID();
  const mixedCaseRecipientUserId = randomUUID();
  const rejectRecipientUserId = randomUUID();
  const activeConflictUserId = randomUUID();
  const reentryUserId = randomUUID();

  const ownerAlphaMembershipId = randomUUID();
  const ownerBetaMembershipId = randomUUID();
  const ownerSuspendedMembershipId = randomUUID();
  const adminAlphaMembershipId = randomUUID();
  const psychologistAlphaMembershipId = randomUUID();
  const reentryRevokedMembershipId = randomUUID();

  const adminAlphaEmail = `invitation-admin-alpha-${suffix}@example.test`;
  const psychologistAlphaEmail = `invitation-psychologist-alpha-${suffix}@example.test`;
  const mixedCaseRecipientEmail = `Invitation.MixedCase.${suffix}@Example.test`;
  const rejectRecipientEmail = `Invitation.Reject.${suffix}@Example.test`;
  const activeConflictEmail = `invitation.active.${suffix}@example.test`;
  const reentryEmail = `invitation.reentry.${suffix}@example.test`;

  type InvitationListItem = {
    id: string;
    email: string;
    logicalStatus: string;
    token?: string;
    tokenDigest?: string;
  };
  type InvitationIssueResponse = {
    id: string;
    token: string;
  };
  type AcceptedMembershipResponse = {
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
        'Invitation administration E2E requires DATABASE_URL ending in _test',
      );
    }

    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = 'invitation-administration-jwt-key-2026';
    prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
    await prisma.$connect();

    await prisma.user.createMany({
      data: [
        user(
          ownerAlphaUserId,
          `invitation-owner-alpha-${suffix}@example.test`,
          UserRole.ADMIN,
        ),
        user(
          ownerBetaUserId,
          `invitation-owner-beta-${suffix}@example.test`,
          UserRole.ADMIN,
        ),
        user(
          ownerSuspendedUserId,
          `invitation-owner-suspended-${suffix}@example.test`,
          UserRole.ADMIN,
        ),
        user(adminAlphaUserId, adminAlphaEmail, UserRole.ADMIN),
        user(
          psychologistAlphaUserId,
          psychologistAlphaEmail,
          UserRole.PSYCHOLOGIST,
        ),
        user(mixedCaseRecipientUserId, mixedCaseRecipientEmail, UserRole.ADMIN),
        user(rejectRecipientUserId, rejectRecipientEmail, UserRole.ADMIN),
        user(activeConflictUserId, activeConflictEmail, UserRole.ADMIN),
        user(reentryUserId, reentryEmail, UserRole.PSYCHOLOGIST),
      ],
    });

    await prisma.organization.createMany({
      data: [
        organization(organizationAlphaId, `invitation-alpha-${suffix}`),
        organization(organizationBetaId, `invitation-beta-${suffix}`),
        organization(
          organizationSuspendedId,
          `invitation-suspended-${suffix}`,
          OrganizationStatus.SUSPENDED,
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
          ownerBetaMembershipId,
          ownerBetaUserId,
          organizationBetaId,
          MembershipRole.OWNER,
        ),
        membership(
          ownerSuspendedMembershipId,
          ownerSuspendedUserId,
          organizationSuspendedId,
          MembershipRole.OWNER,
        ),
        membership(
          adminAlphaMembershipId,
          adminAlphaUserId,
          organizationAlphaId,
          MembershipRole.ADMIN,
        ),
        membership(
          psychologistAlphaMembershipId,
          psychologistAlphaUserId,
          organizationAlphaId,
          MembershipRole.PSYCHOLOGIST,
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

  afterEach(async () => {
    await prisma.organizationInvitation.deleteMany({
      where: {
        organizationId: {
          in: [
            organizationAlphaId,
            organizationBetaId,
            organizationSuspendedId,
          ],
        },
      },
    });
    await prisma.organizationMembership.deleteMany({
      where: {
        userId: {
          in: [
            mixedCaseRecipientUserId,
            rejectRecipientUserId,
            activeConflictUserId,
            reentryUserId,
          ],
        },
        id: { notIn: [reentryRevokedMembershipId] },
      },
    });
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
          ],
        },
      },
    });
    await prisma?.organizationMembership.deleteMany({
      where: {
        id: {
          in: [
            ownerAlphaMembershipId,
            ownerBetaMembershipId,
            ownerSuspendedMembershipId,
            adminAlphaMembershipId,
            psychologistAlphaMembershipId,
            reentryRevokedMembershipId,
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
            ownerSuspendedUserId,
            adminAlphaUserId,
            psychologistAlphaUserId,
            mixedCaseRecipientUserId,
            rejectRecipientUserId,
            activeConflictUserId,
            reentryUserId,
          ],
        },
      },
    });
    await prisma?.$disconnect();
  });

  it('lets OWNER and ADMIN list invitations, blocks PSYCHOLOGIST, and keeps the projection sanitized', async () => {
    await prisma.organizationInvitation.createMany({
      data: [
        {
          id: randomUUID(),
          organizationId: organizationAlphaId,
          email: 'accepted-list@example.test',
          normalizedEmail: normalizeInvitationEmail(
            'accepted-list@example.test',
          ),
          invitedUserId: mixedCaseRecipientUserId,
          role: MembershipRole.ADMIN,
          tokenDigest: tokenDigest(),
          expiresAt: new Date('2026-08-20T00:00:00.000Z'),
          acceptedAt: new Date('2026-08-02T00:00:00.000Z'),
          acceptedByUserId: mixedCaseRecipientUserId,
        },
        {
          id: randomUUID(),
          organizationId: organizationAlphaId,
          email: 'pending-list@example.test',
          normalizedEmail: normalizeInvitationEmail(
            'pending-list@example.test',
          ),
          role: MembershipRole.PSYCHOLOGIST,
          tokenDigest: tokenDigest(),
          expiresAt: new Date('2026-08-21T00:00:00.000Z'),
        },
      ],
    });

    const ownerList = await request(app.getHttpServer())
      .get(`/organizations/${organizationAlphaId}/invitations`)
      .set('Authorization', bearerToken(ownerAlphaUserId, UserRole.ADMIN))
      .set('X-Organization-Id', organizationAlphaId)
      .expect(200);
    const ownerListBody = ownerList.body as InvitationListItem[];

    expect(ownerListBody).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: 'accepted-list@example.test',
          logicalStatus: 'ACCEPTED',
        }),
        expect.objectContaining({
          email: 'pending-list@example.test',
          logicalStatus: 'PENDING',
        }),
      ]),
    );
    expect(ownerListBody[0]).not.toHaveProperty('token');
    expect(ownerListBody[0]).not.toHaveProperty('tokenDigest');

    await request(app.getHttpServer())
      .get(`/organizations/${organizationAlphaId}/invitations`)
      .set('Authorization', bearerToken(adminAlphaUserId, UserRole.ADMIN))
      .set('X-Organization-Id', organizationAlphaId)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/organizations/${organizationAlphaId}/invitations`)
      .set(
        'Authorization',
        bearerToken(psychologistAlphaUserId, UserRole.PSYCHOLOGIST),
      )
      .set('X-Organization-Id', organizationAlphaId)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/organizations/${organizationBetaId}/invitations`)
      .set('Authorization', bearerToken(ownerAlphaUserId, UserRole.ADMIN))
      .set('X-Organization-Id', organizationAlphaId)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/organizations/${organizationSuspendedId}/invitations`)
      .set('Authorization', bearerToken(ownerSuspendedUserId, UserRole.ADMIN))
      .set('X-Organization-Id', organizationSuspendedId)
      .expect(403);
  });

  it('allows OWNER and ADMIN to create while rejecting OWNER role and known non-terminal memberships', async () => {
    const ownerResponse = await request(app.getHttpServer())
      .post(`/organizations/${organizationAlphaId}/invitations`)
      .set('Authorization', bearerToken(ownerAlphaUserId, UserRole.ADMIN))
      .set('X-Organization-Id', organizationAlphaId)
      .send({
        email: 'owner-created@example.test',
        role: MembershipRole.PSYCHOLOGIST,
      })
      .expect(201);
    const ownerResponseBody = ownerResponse.body as InvitationIssueResponse;
    expect(ownerResponseBody.token).toEqual(expect.any(String));

    const adminResponse = await request(app.getHttpServer())
      .post(`/organizations/${organizationAlphaId}/invitations`)
      .set('Authorization', bearerToken(adminAlphaUserId, UserRole.ADMIN))
      .set('X-Organization-Id', organizationAlphaId)
      .send({
        email: 'admin-created@example.test',
        role: MembershipRole.ADMIN,
      })
      .expect(201);
    const adminResponseBody = adminResponse.body as InvitationIssueResponse;
    expect(adminResponseBody.token).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .post(`/organizations/${organizationAlphaId}/invitations`)
      .set('Authorization', bearerToken(ownerAlphaUserId, UserRole.ADMIN))
      .set('X-Organization-Id', organizationAlphaId)
      .send({
        email: 'owner-role@example.test',
        role: MembershipRole.OWNER,
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/organizations/${organizationAlphaId}/invitations`)
      .set('Authorization', bearerToken(ownerAlphaUserId, UserRole.ADMIN))
      .set('X-Organization-Id', organizationAlphaId)
      .send({
        email: adminAlphaEmail,
        role: MembershipRole.ADMIN,
      })
      .expect(409);

    await request(app.getHttpServer())
      .post(`/organizations/${organizationSuspendedId}/invitations`)
      .set('Authorization', bearerToken(ownerSuspendedUserId, UserRole.ADMIN))
      .set('X-Organization-Id', organizationSuspendedId)
      .send({
        email: 'blocked-by-suspended-org@example.test',
        role: MembershipRole.PSYCHOLOGIST,
      })
      .expect(403);
  });

  it('keeps revoke and resend owner-only and redacts cross-tenant targets', async () => {
    const invitation = await createInvitationThroughApi(
      'owner-only@example.test',
      MembershipRole.PSYCHOLOGIST,
    );

    await request(app.getHttpServer())
      .post(
        `/organizations/${organizationAlphaId}/invitations/${invitation.id}/revoke`,
      )
      .set('Authorization', bearerToken(adminAlphaUserId, UserRole.ADMIN))
      .set('X-Organization-Id', organizationAlphaId)
      .expect(403);

    await request(app.getHttpServer())
      .post(
        `/organizations/${organizationAlphaId}/invitations/${invitation.id}/resend`,
      )
      .set('Authorization', bearerToken(adminAlphaUserId, UserRole.ADMIN))
      .set('X-Organization-Id', organizationAlphaId)
      .expect(403);

    const betaInvitation = await prisma.organizationInvitation.create({
      data: {
        organizationId: organizationBetaId,
        email: 'cross-tenant@example.test',
        normalizedEmail: normalizeInvitationEmail('cross-tenant@example.test'),
        role: MembershipRole.PSYCHOLOGIST,
        tokenDigest: tokenDigest(),
        expiresAt: new Date('2026-08-20T00:00:00.000Z'),
      },
      select: { id: true },
    });

    await request(app.getHttpServer())
      .post(
        `/organizations/${organizationBetaId}/invitations/${betaInvitation.id}/revoke`,
      )
      .set('Authorization', bearerToken(ownerAlphaUserId, UserRole.ADMIN))
      .set('X-Organization-Id', organizationAlphaId)
      .expect(404);

    await request(app.getHttpServer())
      .post(
        `/organizations/${organizationBetaId}/invitations/${betaInvitation.id}/resend`,
      )
      .set('Authorization', bearerToken(ownerAlphaUserId, UserRole.ADMIN))
      .set('X-Organization-Id', organizationAlphaId)
      .expect(404);

    const suspendedInvitation = await prisma.organizationInvitation.create({
      data: {
        organizationId: organizationSuspendedId,
        email: 'suspended@example.test',
        normalizedEmail: normalizeInvitationEmail('suspended@example.test'),
        role: MembershipRole.PSYCHOLOGIST,
        tokenDigest: tokenDigest(),
        expiresAt: new Date('2026-08-20T00:00:00.000Z'),
      },
      select: { id: true },
    });

    await request(app.getHttpServer())
      .post(
        `/organizations/${organizationSuspendedId}/invitations/${suspendedInvitation.id}/revoke`,
      )
      .set('Authorization', bearerToken(ownerSuspendedUserId, UserRole.ADMIN))
      .set('X-Organization-Id', organizationSuspendedId)
      .expect(403);

    await request(app.getHttpServer())
      .post(
        `/organizations/${organizationSuspendedId}/invitations/${suspendedInvitation.id}/resend`,
      )
      .set('Authorization', bearerToken(ownerSuspendedUserId, UserRole.ADMIN))
      .set('X-Organization-Id', organizationSuspendedId)
      .expect(403);
  });

  it('revokes a pending invitation and keeps the old token unusable', async () => {
    const invitation = await createInvitationThroughApi(
      mixedCaseRecipientEmail.toLocaleLowerCase('en-US'),
      MembershipRole.PSYCHOLOGIST,
    );

    await request(app.getHttpServer())
      .post(
        `/organizations/${organizationAlphaId}/invitations/${invitation.id}/revoke`,
      )
      .set('Authorization', bearerToken(ownerAlphaUserId, UserRole.ADMIN))
      .set('X-Organization-Id', organizationAlphaId)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          id: invitation.id,
          logicalStatus: 'REVOKED',
        });
      });

    await request(app.getHttpServer())
      .post(`/organization-invitations/${invitation.token}/accept`)
      .set(
        'Authorization',
        bearerToken(mixedCaseRecipientUserId, UserRole.ADMIN),
      )
      .expect(409);
  });

  it('replaces pending invitations on resend and accepts only the new token with canonicalized recipient matching', async () => {
    const invitation = await createInvitationThroughApi(
      mixedCaseRecipientEmail.toLocaleLowerCase('en-US'),
      MembershipRole.ADMIN,
    );

    const resent = await request(app.getHttpServer())
      .post(
        `/organizations/${organizationAlphaId}/invitations/${invitation.id}/resend`,
      )
      .set('Authorization', bearerToken(ownerAlphaUserId, UserRole.ADMIN))
      .set('X-Organization-Id', organizationAlphaId)
      .expect(201);
    const resentBody = resent.body as InvitationIssueResponse;

    expect(resentBody.id).not.toBe(invitation.id);
    expect(resentBody.token).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .post(`/organization-invitations/${invitation.token}/accept`)
      .set(
        'Authorization',
        bearerToken(mixedCaseRecipientUserId, UserRole.ADMIN),
      )
      .expect(409);

    await request(app.getHttpServer())
      .post(`/organization-invitations/${resentBody.token}/accept`)
      .set(
        'Authorization',
        bearerToken(mixedCaseRecipientUserId, UserRole.ADMIN),
      )
      .expect(201)
      .expect((response) => {
        expect(response.body).toMatchObject({
          organizationId: organizationAlphaId,
          role: MembershipRole.ADMIN,
          status: MembershipStatus.ACTIVE,
        });
      });
  });

  it('replaces logically expired invitations on resend and preserves the original as EXPIRED', async () => {
    const invitation = await createInvitationThroughApi(
      mixedCaseRecipientEmail.toLocaleLowerCase('en-US'),
      MembershipRole.ADMIN,
    );

    await prisma.organizationInvitation.update({
      where: { id: invitation.id },
      data: { expiresAt: new Date('2026-01-01T00:00:00.000Z') },
    });

    const resent = await request(app.getHttpServer())
      .post(
        `/organizations/${organizationAlphaId}/invitations/${invitation.id}/resend`,
      )
      .set('Authorization', bearerToken(ownerAlphaUserId, UserRole.ADMIN))
      .set('X-Organization-Id', organizationAlphaId)
      .expect(201);
    const resentBody = resent.body as InvitationIssueResponse;

    expect(resentBody.id).not.toBe(invitation.id);
    expect(resentBody.token).toEqual(expect.any(String));

    const historical = await prisma.organizationInvitation.findUniqueOrThrow({
      where: { id: invitation.id },
      select: { revokedAt: true, expiredAt: true },
    });
    expect(historical.revokedAt).toBeNull();
    expect(historical.expiredAt).toBeInstanceOf(Date);

    await request(app.getHttpServer())
      .post(`/organization-invitations/${invitation.token}/accept`)
      .set(
        'Authorization',
        bearerToken(mixedCaseRecipientUserId, UserRole.ADMIN),
      )
      .expect(409);

    await request(app.getHttpServer())
      .post(`/organization-invitations/${resentBody.token}/accept`)
      .set(
        'Authorization',
        bearerToken(mixedCaseRecipientUserId, UserRole.ADMIN),
      )
      .expect(201)
      .expect((response) => {
        expect(response.body).toMatchObject({
          organizationId: organizationAlphaId,
          role: MembershipRole.ADMIN,
          status: MembershipStatus.ACTIVE,
        });
      });
  });

  it('permits membership re-entry when the user only has revoked history', async () => {
    const invitation = await createInvitationThroughApi(
      reentryEmail,
      MembershipRole.PSYCHOLOGIST,
    );

    const accepted = await request(app.getHttpServer())
      .post(`/organization-invitations/${invitation.token}/accept`)
      .set('Authorization', bearerToken(reentryUserId, UserRole.PSYCHOLOGIST))
      .expect(201);
    const acceptedBody = accepted.body as AcceptedMembershipResponse;

    expect(acceptedBody.id).not.toBe(reentryRevokedMembershipId);

    const memberships = await prisma.organizationMembership.findMany({
      where: {
        organizationId: organizationAlphaId,
        userId: reentryUserId,
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, status: true },
    });

    expect(memberships).toHaveLength(2);
    expect(memberships[0]).toMatchObject({
      id: reentryRevokedMembershipId,
      status: MembershipStatus.REVOKED,
    });
    expect(memberships[1]).toMatchObject({
      id: acceptedBody.id,
      status: MembershipStatus.ACTIVE,
    });
  });

  it('blocks acceptance when a non-terminal membership appears after invitation issuance', async () => {
    const invitation = await createInvitationThroughApi(
      activeConflictEmail,
      MembershipRole.PSYCHOLOGIST,
    );

    await prisma.organizationMembership.create({
      data: membership(
        randomUUID(),
        activeConflictUserId,
        organizationAlphaId,
        MembershipRole.PSYCHOLOGIST,
      ),
    });

    await request(app.getHttpServer())
      .post(`/organization-invitations/${invitation.token}/accept`)
      .set('Authorization', bearerToken(activeConflictUserId, UserRole.ADMIN))
      .expect(409);
  });

  it('rejects with canonicalized recipient binding and prevents replay', async () => {
    const invitation = await createInvitationThroughApi(
      rejectRecipientEmail.toLocaleLowerCase('en-US'),
      MembershipRole.PSYCHOLOGIST,
    );

    await request(app.getHttpServer())
      .post(`/organization-invitations/${invitation.token}/reject`)
      .set('Authorization', bearerToken(rejectRecipientUserId, UserRole.ADMIN))
      .expect(201)
      .expect((response) => {
        expect(response.body).toMatchObject({
          id: invitation.id,
        });
      });

    await request(app.getHttpServer())
      .post(`/organization-invitations/${invitation.token}/reject`)
      .set('Authorization', bearerToken(rejectRecipientUserId, UserRole.ADMIN))
      .expect(409);
  });

  async function createInvitationThroughApi(
    email: string,
    role: MembershipRole,
  ) {
    const response = await request(app.getHttpServer())
      .post(`/organizations/${organizationAlphaId}/invitations`)
      .set('Authorization', bearerToken(ownerAlphaUserId, UserRole.ADMIN))
      .set('X-Organization-Id', organizationAlphaId)
      .send({ email, role })
      .expect(201);

    return response.body as { id: string; token: string };
  }

  function bearerToken(userId: string, role: UserRole) {
    return `Bearer ${jwtService.sign({
      sub: userId,
      name: 'Invitation Runtime User',
      email: 'invitation-runtime@example.test',
      role,
    })}`;
  }
});

function user(id: string, email: string, role: UserRole) {
  return {
    id,
    name: 'Invitation Runtime User',
    email,
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
    legalName: 'Invitation Runtime Legal Name',
    displayName: 'Invitation Runtime',
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
  return {
    id,
    userId,
    organizationId,
    role,
    status,
    joinedAt:
      status === MembershipStatus.INVITED
        ? null
        : new Date('2026-01-01T00:00:00.000Z'),
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

function tokenDigest() {
  return randomUUID().replace(/-/g, '').repeat(2).slice(0, 64);
}
