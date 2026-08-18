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

describeCertification('Organization ownership transfer runtime', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let jwtService: JwtService;
  const databaseUrl = process.env.DATABASE_URL;
  const suffix = randomUUID();

  const organizationId = randomUUID();
  const organizationSuccessId = randomUUID();
  const organizationSuspendedId = randomUUID();

  const ownerUserId = randomUUID();
  const ownerTwoUserId = randomUUID();
  const adminUserId = randomUUID();
  const psychologistUserId = randomUUID();
  const suspendedMemberUserId = randomUUID();
  const successOwnerUserId = randomUUID();
  const successTargetUserId = randomUUID();
  const suspendedOrgOwnerUserId = randomUUID();
  const suspendedOrgTargetUserId = randomUUID();

  const ownerMembershipId = randomUUID();
  const ownerTwoMembershipId = randomUUID();
  const adminMembershipId = randomUUID();
  const psychologistMembershipId = randomUUID();
  const suspendedMembershipId = randomUUID();
  const successOwnerMembershipId = randomUUID();
  const successTargetMembershipId = randomUUID();
  const suspendedOrgOwnerMembershipId = randomUUID();
  const suspendedOrgTargetMembershipId = randomUUID();

  type OwnershipTransferResponse = {
    organizationId: string;
    sourceMembership: {
      id: string;
      userId: string;
      role: MembershipRole;
      status: MembershipStatus;
    };
    targetMembership: {
      id: string;
      userId: string;
      role: MembershipRole;
      status: MembershipStatus;
    };
    transferredAt: string;
  };

  beforeAll(async () => {
    if (
      !databaseUrl ||
      !new URL(databaseUrl).pathname.slice(1).endsWith('_test')
    ) {
      throw new Error(
        'Ownership transfer E2E requires DATABASE_URL ending in _test',
      );
    }

    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = 'ownership-transfer-jwt-signing-key-2026';
    prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
    await prisma.$connect();

    await prisma.user.createMany({
      data: [
        user(ownerUserId, `ownership-owner-${suffix}@example.test`),
        user(ownerTwoUserId, `ownership-owner-two-${suffix}@example.test`),
        user(adminUserId, `ownership-admin-${suffix}@example.test`),
        user(
          psychologistUserId,
          `ownership-psychologist-${suffix}@example.test`,
          UserRole.PSYCHOLOGIST,
        ),
        user(
          suspendedMemberUserId,
          `ownership-suspended-${suffix}@example.test`,
          UserRole.PSYCHOLOGIST,
        ),
        user(
          successOwnerUserId,
          `ownership-success-owner-${suffix}@example.test`,
        ),
        user(
          successTargetUserId,
          `ownership-success-target-${suffix}@example.test`,
        ),
        user(
          suspendedOrgOwnerUserId,
          `ownership-suspended-org-owner-${suffix}@example.test`,
        ),
        user(
          suspendedOrgTargetUserId,
          `ownership-suspended-org-target-${suffix}@example.test`,
        ),
      ],
    });

    await prisma.organization.createMany({
      data: [
        organization(organizationId, `ownership-${suffix}`),
        organization(organizationSuccessId, `ownership-success-${suffix}`),
        organization(
          organizationSuspendedId,
          `ownership-suspended-${suffix}`,
          OrganizationStatus.SUSPENDED,
        ),
      ],
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
          ownerTwoMembershipId,
          ownerTwoUserId,
          organizationId,
          MembershipRole.OWNER,
        ),
        membership(
          adminMembershipId,
          adminUserId,
          organizationId,
          MembershipRole.ADMIN,
        ),
        membership(
          psychologistMembershipId,
          psychologistUserId,
          organizationId,
          MembershipRole.PSYCHOLOGIST,
        ),
        membership(
          suspendedMembershipId,
          suspendedMemberUserId,
          organizationId,
          MembershipRole.BILLING,
          MembershipStatus.SUSPENDED,
        ),
        membership(
          successOwnerMembershipId,
          successOwnerUserId,
          organizationSuccessId,
          MembershipRole.OWNER,
        ),
        membership(
          successTargetMembershipId,
          successTargetUserId,
          organizationSuccessId,
          MembershipRole.ADMIN,
        ),
        membership(
          suspendedOrgOwnerMembershipId,
          suspendedOrgOwnerUserId,
          organizationSuspendedId,
          MembershipRole.OWNER,
        ),
        membership(
          suspendedOrgTargetMembershipId,
          suspendedOrgTargetUserId,
          organizationSuspendedId,
          MembershipRole.ADMIN,
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
    await prisma?.organizationMembership.deleteMany({
      where: {
        id: {
          in: [
            ownerMembershipId,
            ownerTwoMembershipId,
            adminMembershipId,
            psychologistMembershipId,
            suspendedMembershipId,
            successOwnerMembershipId,
            successTargetMembershipId,
            suspendedOrgOwnerMembershipId,
            suspendedOrgTargetMembershipId,
          ],
        },
      },
    });
    await prisma?.organization.deleteMany({
      where: {
        id: {
          in: [organizationId, organizationSuccessId, organizationSuspendedId],
        },
      },
    });
    await prisma?.user.deleteMany({
      where: {
        id: {
          in: [
            ownerUserId,
            ownerTwoUserId,
            adminUserId,
            psychologistUserId,
            suspendedMemberUserId,
            successOwnerUserId,
            successTargetUserId,
            suspendedOrgOwnerUserId,
            suspendedOrgTargetUserId,
          ],
        },
      },
    });
    await prisma?.$disconnect();
  });

  it('validates the DTO and blocks non-owners before any transfer starts', async () => {
    const ownerToken = bearerToken(ownerUserId, UserRole.ADMIN);
    const adminToken = bearerToken(adminUserId, UserRole.ADMIN);

    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/ownership-transfer`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationId)
      .send({ targetMembershipId: 'not-a-uuid' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/ownership-transfer`)
      .set('Authorization', adminToken)
      .set('X-Organization-Id', organizationId)
      .send({ targetMembershipId: psychologistMembershipId })
      .expect(403);
  });

  it('rejects self-target, owner-target, suspended-target, foreign-target, and suspended-organization requests', async () => {
    const ownerToken = bearerToken(ownerUserId, UserRole.ADMIN);
    const suspendedOwnerToken = bearerToken(
      suspendedOrgOwnerUserId,
      UserRole.ADMIN,
    );

    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/ownership-transfer`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationId)
      .send({ targetMembershipId: ownerMembershipId })
      .expect(409);

    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/ownership-transfer`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationId)
      .send({ targetMembershipId: ownerTwoMembershipId })
      .expect(409);

    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/ownership-transfer`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationId)
      .send({ targetMembershipId: suspendedMembershipId })
      .expect(409);

    await request(app.getHttpServer())
      .post(`/organizations/${organizationId}/ownership-transfer`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationId)
      .send({ targetMembershipId: successTargetMembershipId })
      .expect(404);

    await request(app.getHttpServer())
      .post(`/organizations/${organizationSuspendedId}/ownership-transfer`)
      .set('Authorization', suspendedOwnerToken)
      .set('X-Organization-Id', organizationSuspendedId)
      .send({ targetMembershipId: suspendedOrgTargetMembershipId })
      .expect(409);
  });

  it('transfers ownership atomically and returns the demoted source plus promoted target', async () => {
    const ownerToken = bearerToken(successOwnerUserId, UserRole.ADMIN);

    const response = await request(app.getHttpServer())
      .post(`/organizations/${organizationSuccessId}/ownership-transfer`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationSuccessId)
      .send({ targetMembershipId: successTargetMembershipId })
      .expect(200);
    const body = response.body as OwnershipTransferResponse;

    expect(body).toMatchObject({
      organizationId: organizationSuccessId,
      sourceMembership: {
        id: successOwnerMembershipId,
        userId: successOwnerUserId,
        role: MembershipRole.ADMIN,
        status: MembershipStatus.ACTIVE,
      },
      targetMembership: {
        id: successTargetMembershipId,
        userId: successTargetUserId,
        role: MembershipRole.OWNER,
        status: MembershipStatus.ACTIVE,
      },
    });
    expect(body.transferredAt).toEqual(expect.any(String));

    expect(
      await prisma.organizationMembership.findUniqueOrThrow({
        where: { id: successOwnerMembershipId },
        select: { role: true, status: true },
      }),
    ).toEqual({
      role: MembershipRole.ADMIN,
      status: MembershipStatus.ACTIVE,
    });
    expect(
      await prisma.organizationMembership.findUniqueOrThrow({
        where: { id: successTargetMembershipId },
        select: { role: true, status: true },
      }),
    ).toEqual({
      role: MembershipRole.OWNER,
      status: MembershipStatus.ACTIVE,
    });

    await request(app.getHttpServer())
      .post(`/organizations/${organizationSuccessId}/ownership-transfer`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationSuccessId)
      .send({ targetMembershipId: successOwnerMembershipId })
      .expect(403);
  });

  function bearerToken(userId: string, role: UserRole) {
    return `Bearer ${jwtService.sign({
      sub: userId,
      name: 'Ownership Transfer User',
      email: 'ownership-transfer@example.test',
      role,
    })}`;
  }
});

function user(id: string, email: string, role: UserRole = UserRole.ADMIN) {
  return {
    id,
    name: 'Ownership Transfer User',
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
    legalName: 'Ownership Transfer Legal Name',
    displayName: 'Ownership Transfer',
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
