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
  process.env.RUN_ORGANIZATION_CONFIGURATION_TESTS === 'true'
    ? describe
    : describe.skip;

describeCertification('Organization configuration runtime', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let jwtService: JwtService;
  const databaseUrl = process.env.DATABASE_URL;
  const suffix = randomUUID();
  const ownerUserId = randomUUID();
  const administratorUserId = randomUUID();
  const organizationAlphaId = randomUUID();
  const organizationBetaId = randomUUID();

  beforeAll(async () => {
    if (
      !databaseUrl ||
      !new URL(databaseUrl).pathname.slice(1).endsWith('_test')
    ) {
      throw new Error(
        'Organization configuration E2E requires DATABASE_URL ending in _test',
      );
    }

    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = 'organization-configuration-jwt-key-2026';
    prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
    await prisma.$connect();
    await prisma.user.createMany({
      data: [
        user(ownerUserId, `configuration-owner-${suffix}@example.test`),
        user(
          administratorUserId,
          `configuration-administrator-${suffix}@example.test`,
        ),
      ],
    });
    await prisma.organization.createMany({
      data: [
        organization(organizationAlphaId, `configuration-alpha-${suffix}`),
        organization(organizationBetaId, `configuration-beta-${suffix}`),
      ],
    });
    await prisma.organizationMembership.createMany({
      data: [
        membership(ownerUserId, organizationAlphaId, MembershipRole.OWNER),
        membership(ownerUserId, organizationBetaId, MembershipRole.OWNER),
        membership(
          administratorUserId,
          organizationAlphaId,
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
    try {
      await prisma?.organizationMembership.deleteMany({
        where: { userId: { in: [ownerUserId, administratorUserId] } },
      });
      await prisma?.organization.deleteMany({
        where: { id: { in: [organizationAlphaId, organizationBetaId] } },
      });
      await prisma?.user.deleteMany({
        where: { id: { in: [ownerUserId, administratorUserId] } },
      });
    } catch {
      // Ignore cleanup constraint errors on immutable audit logs
    }
    await prisma?.$disconnect();
  });

  it('returns effective absent defaults and guards configuration by tenant and capability', async () => {
    const ownerToken = bearerToken(ownerUserId);
    const administratorToken = bearerToken(administratorUserId);

    await request(app.getHttpServer())
      .get(`/organizations/${organizationAlphaId}/settings`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationAlphaId)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({
          rowState: 'ABSENT',
          updatedAt: null,
          defaultAppointmentDuration: 60,
          persistedDefaultAppointmentDuration: null,
        });
      });

    await request(app.getHttpServer())
      .get(`/organizations/${organizationAlphaId}/branding`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationAlphaId)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({
          rowState: 'ABSENT',
          updatedAt: null,
          primaryColor: null,
        });
      });

    await request(app.getHttpServer())
      .patch(`/organizations/${organizationAlphaId}/settings`)
      .set('Authorization', administratorToken)
      .set('X-Organization-Id', organizationAlphaId)
      .send({ defaultAppointmentDuration: 45, expectedRowState: 'ABSENT' })
      .expect(403);

    await request(app.getHttpServer())
      .get(`/organizations/${organizationBetaId}/settings`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationAlphaId)
      .expect(404);
  });

  it('implements settings first-write CAS, stale detection, reset, and dormant-field preservation', async () => {
    const ownerToken = bearerToken(ownerUserId);
    const firstWrite = await request(app.getHttpServer())
      .patch(`/organizations/${organizationAlphaId}/settings`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationAlphaId)
      .send({ defaultAppointmentDuration: 45, expectedRowState: 'ABSENT' })
      .expect(200);

    expect(firstWrite.body).toMatchObject({
      rowState: 'PRESENT',
      defaultAppointmentDuration: 45,
      persistedDefaultAppointmentDuration: 45,
    });
    await prisma.organizationSettings.update({
      where: { organizationId: organizationAlphaId },
      data: { weekStartsOn: 0 },
    });
    const firstWriteBody = firstWrite.body as { updatedAt: string };

    await request(app.getHttpServer())
      .patch(`/organizations/${organizationAlphaId}/settings`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationAlphaId)
      .send({
        defaultAppointmentDuration: 50,
        expectedUpdatedAt: firstWriteBody.updatedAt,
      })
      .expect(409);

    const current = await prisma.organizationSettings.findUniqueOrThrow({
      where: { organizationId: organizationAlphaId },
    });
    const reset = await request(app.getHttpServer())
      .patch(`/organizations/${organizationAlphaId}/settings`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationAlphaId)
      .send({
        defaultAppointmentDuration: null,
        expectedUpdatedAt: current.updatedAt.toISOString(),
      })
      .expect(200);
    expect(reset.body).toMatchObject({
      rowState: 'PRESENT',
      defaultAppointmentDuration: 60,
      persistedDefaultAppointmentDuration: null,
    });
    await expect(
      prisma.organizationSettings.findUniqueOrThrow({
        where: { organizationId: organizationAlphaId },
      }),
    ).resolves.toMatchObject({ weekStartsOn: 0 });
  });

  it('implements bounded branding normalization, reset, and dormant-field preservation', async () => {
    const ownerToken = bearerToken(ownerUserId);
    const firstWrite = await request(app.getHttpServer())
      .patch(`/organizations/${organizationAlphaId}/branding`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationAlphaId)
      .send({ primaryColor: '#2563eb', expectedRowState: 'ABSENT' })
      .expect(200);
    expect(firstWrite.body).toMatchObject({ primaryColor: '#2563EB' });

    await prisma.organizationBranding.update({
      where: { organizationId: organizationAlphaId },
      data: { visualName: 'Protected legacy label', accentColor: '#0F766E' },
    });
    const current = await prisma.organizationBranding.findUniqueOrThrow({
      where: { organizationId: organizationAlphaId },
    });
    await request(app.getHttpServer())
      .patch(`/organizations/${organizationAlphaId}/branding`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationAlphaId)
      .send({
        primaryColor: null,
        expectedUpdatedAt: current.updatedAt.toISOString(),
      })
      .expect(200)
      .expect((response) => {
        expect(
          (response.body as { primaryColor: string | null }).primaryColor,
        ).toBeNull();
      });
    await expect(
      prisma.organizationBranding.findUniqueOrThrow({
        where: { organizationId: organizationAlphaId },
      }),
    ).resolves.toMatchObject({
      visualName: 'Protected legacy label',
      accentColor: '#0F766E',
    });

    await request(app.getHttpServer())
      .patch(`/organizations/${organizationAlphaId}/branding`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationAlphaId)
      .send({ primaryColor: '#000000', expectedRowState: 'ABSENT' })
      .expect(400);
  });

  it('produces one canonical row and one conflict for concurrent first writes', async () => {
    const ownerToken = bearerToken(ownerUserId);
    const baseRequest = () =>
      request(app.getHttpServer())
        .patch(`/organizations/${organizationBetaId}/settings`)
        .set('Authorization', ownerToken)
        .set('X-Organization-Id', organizationBetaId)
        .send({ expectedRowState: 'ABSENT', defaultAppointmentDuration: 30 });

    const [first, second] = await Promise.all([baseRequest(), baseRequest()]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    await expect(
      prisma.organizationSettings.findUniqueOrThrow({
        where: { organizationId: organizationBetaId },
      }),
    ).resolves.toMatchObject({ defaultAppointmentDuration: 30 });

    const brandingRequest = () =>
      request(app.getHttpServer())
        .patch(`/organizations/${organizationBetaId}/branding`)
        .set('Authorization', ownerToken)
        .set('X-Organization-Id', organizationBetaId)
        .send({ expectedRowState: 'ABSENT', primaryColor: '#2563EB' });

    const [firstBranding, secondBranding] = await Promise.all([
      brandingRequest(),
      brandingRequest(),
    ]);
    expect([firstBranding.status, secondBranding.status].sort()).toEqual([
      200, 409,
    ]);
    await expect(
      prisma.organizationBranding.findUniqueOrThrow({
        where: { organizationId: organizationBetaId },
      }),
    ).resolves.toMatchObject({ primaryColor: '#2563EB' });
  });

  it('allows the selected owner to read and repair configuration while suspended', async () => {
    const ownerToken = bearerToken(ownerUserId);
    await prisma.organization.update({
      where: { id: organizationAlphaId },
      data: { status: OrganizationStatus.SUSPENDED },
    });

    await request(app.getHttpServer())
      .get(`/organizations/${organizationAlphaId}/settings`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationAlphaId)
      .expect(200);
    const current = await prisma.organizationSettings.findUniqueOrThrow({
      where: { organizationId: organizationAlphaId },
    });
    await request(app.getHttpServer())
      .patch(`/organizations/${organizationAlphaId}/settings`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationAlphaId)
      .send({
        defaultAppointmentDuration: 60,
        expectedUpdatedAt: current.updatedAt.toISOString(),
      })
      .expect(200);
    await prisma.organization.update({
      where: { id: organizationAlphaId },
      data: { status: OrganizationStatus.ACTIVE },
    });
  });

  function bearerToken(userId: string) {
    return `Bearer ${jwtService.sign({
      sub: userId,
      name: 'Organization Configuration User',
      email: 'organization-configuration@example.test',
      role: UserRole.ADMIN,
    })}`;
  }
});

function user(id: string, email: string) {
  return {
    id,
    name: 'Organization Configuration User',
    email,
    normalizedEmail: normalizeEmailIdentity(email),
    passwordHash: 'not-a-real-password',
    role: UserRole.ADMIN,
  };
}

function organization(id: string, slug: string) {
  return {
    id,
    slug,
    legalName: 'Organization Configuration Legal Name',
    displayName: 'Organization Configuration',
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
