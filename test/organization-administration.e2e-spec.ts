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

const describeCertification =
  process.env.RUN_TENANT_CERTIFICATION_TESTS === 'true'
    ? describe
    : describe.skip;

describeCertification('Organization administration runtime', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let jwtService: JwtService;
  const databaseUrl = process.env.DATABASE_URL;
  const suffix = randomUUID();
  const ownerUserId = randomUUID();
  const adminUserId = randomUUID();
  const organizationAlphaId = randomUUID();
  const organizationBetaId = randomUUID();

  beforeAll(async () => {
    if (
      !databaseUrl ||
      !new URL(databaseUrl).pathname.slice(1).endsWith('_test')
    ) {
      throw new Error(
        'Organization administration E2E requires DATABASE_URL ending in _test',
      );
    }

    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = 'organization-administration-jwt-key-2026';
    prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
    await prisma.$connect();
    await prisma.user.createMany({
      data: [
        user(ownerUserId, `org-owner-${suffix}@example.test`, UserRole.ADMIN),
        user(adminUserId, `org-admin-${suffix}@example.test`, UserRole.ADMIN),
      ],
    });
    await prisma.organization.createMany({
      data: [
        organization(organizationAlphaId, `org-alpha-${suffix}`),
        organization(organizationBetaId, `org-beta-${suffix}`),
      ],
    });
    await prisma.organizationMembership.createMany({
      data: [
        membership(ownerUserId, organizationAlphaId, MembershipRole.OWNER),
        membership(ownerUserId, organizationBetaId, MembershipRole.OWNER),
        membership(adminUserId, organizationAlphaId, MembershipRole.ADMIN),
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
        userId: { in: [ownerUserId, adminUserId] },
      },
    });
    await prisma?.organization.deleteMany({
      where: { id: { in: [organizationAlphaId, organizationBetaId] } },
    });
    await prisma?.user.deleteMany({
      where: { id: { in: [ownerUserId, adminUserId] } },
    });
    await prisma?.$disconnect();
  });

  it('lets an owner update, suspend, read, and reactivate an organization while other tenant routes stay blocked', async () => {
    const ownerToken = bearerToken(ownerUserId, UserRole.ADMIN);

    const updated = await request(app.getHttpServer())
      .patch(`/organizations/${organizationAlphaId}`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationAlphaId)
      .send({
        displayName: 'Organization Alpha Updated',
        legalName: 'Organization Alpha Legal Updated',
        slug: 'organization-alpha-updated',
        timezone: 'America/Hermosillo',
        locale: 'es-MX',
        currency: 'USD',
      })
      .expect(200);
    expect(updated.body).toMatchObject({
      id: organizationAlphaId,
      displayName: 'Organization Alpha Updated',
      legalName: 'Organization Alpha Legal Updated',
      slug: 'organization-alpha-updated',
      timezone: 'America/Hermosillo',
      locale: 'es-MX',
      currency: 'USD',
      status: OrganizationStatus.ACTIVE,
    });

    const suspended = await request(app.getHttpServer())
      .patch(`/organizations/${organizationAlphaId}/status`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationAlphaId)
      .send({ status: OrganizationStatus.SUSPENDED })
      .expect(200);
    expect(suspended.body).toMatchObject({
      id: organizationAlphaId,
      status: OrganizationStatus.SUSPENDED,
    });

    await request(app.getHttpServer())
      .patch(`/organizations/${organizationAlphaId}/status`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationAlphaId)
      .send({ status: OrganizationStatus.SUSPENDED })
      .expect(409);

    await request(app.getHttpServer())
      .get(`/organizations/${organizationAlphaId}`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationAlphaId)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          id: organizationAlphaId,
          status: OrganizationStatus.SUSPENDED,
        });
      });

    await request(app.getHttpServer())
      .get('/organizations/current')
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationAlphaId)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          id: organizationAlphaId,
          status: OrganizationStatus.SUSPENDED,
        });
      });

    await request(app.getHttpServer())
      .get('/patients')
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationAlphaId)
      .expect(403);

    const list = await request(app.getHttpServer())
      .get('/organizations')
      .set('Authorization', ownerToken)
      .expect(200);
    expect(list.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: organizationAlphaId,
          status: OrganizationStatus.SUSPENDED,
        }),
        expect.objectContaining({
          id: organizationBetaId,
          status: OrganizationStatus.ACTIVE,
        }),
      ]),
    );

    await request(app.getHttpServer())
      .patch(`/organizations/${organizationAlphaId}/status`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationAlphaId)
      .send({ status: OrganizationStatus.ACTIVE })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          id: organizationAlphaId,
          status: OrganizationStatus.ACTIVE,
        });
      });
  });

  it('keeps organization mutations owner-only and preserves redacted path semantics', async () => {
    const ownerToken = bearerToken(ownerUserId, UserRole.ADMIN);
    const adminToken = bearerToken(adminUserId, UserRole.ADMIN);

    await request(app.getHttpServer())
      .patch(`/organizations/${organizationAlphaId}`)
      .set('Authorization', adminToken)
      .set('X-Organization-Id', organizationAlphaId)
      .send({ displayName: 'Admin should not update this' })
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/organizations/${organizationAlphaId}`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationAlphaId)
      .send({ status: OrganizationStatus.SUSPENDED })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/organizations/${organizationAlphaId}/status`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationAlphaId)
      .send({ status: 'ARCHIVED' })
      .expect(400);

    await request(app.getHttpServer())
      .get(`/organizations/${organizationBetaId}`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationAlphaId)
      .expect(404);
  });

  function bearerToken(userId: string, role: UserRole) {
    return `Bearer ${jwtService.sign({
      sub: userId,
      name: 'Organization Runtime User',
      email: 'organization-runtime@example.test',
      role,
    })}`;
  }
});

function user(id: string, email: string, role: UserRole) {
  return {
    id,
    name: 'Organization Runtime User',
    email,
    passwordHash: 'not-a-real-password',
    role,
  };
}

function organization(id: string, slug: string) {
  return {
    id,
    slug,
    legalName: 'Organization Runtime Legal Name',
    displayName: 'Organization Runtime',
    status: OrganizationStatus.ACTIVE,
  };
}

function membership(
  userId: string,
  organizationId: string,
  role: MembershipRole,
) {
  return {
    userId,
    organizationId,
    role,
    status: MembershipStatus.ACTIVE,
    joinedAt: new Date(),
  };
}
