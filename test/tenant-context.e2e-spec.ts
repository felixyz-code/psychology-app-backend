import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  MembershipRole,
  OrganizationStatus,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const describeCertification =
  process.env.RUN_TENANT_CERTIFICATION_TESTS === 'true'
    ? describe
    : describe.skip;

describeCertification('Tenant context runtime guard integration', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let jwtService: JwtService;
  const databaseUrl = process.env.DATABASE_URL;
  const suffix = randomUUID();
  const userOneId = randomUUID();
  const userMultipleId = randomUUID();
  const userLegacyId = randomUUID();
  const organizationOneId = randomUUID();
  const organizationMultipleOneId = randomUUID();
  const organizationMultipleTwoId = randomUUID();

  beforeAll(async () => {
    if (
      !databaseUrl ||
      !new URL(databaseUrl).pathname.slice(1).endsWith('_test')
    ) {
      throw new Error(
        'Tenant runtime certification requires DATABASE_URL ending in _test',
      );
    }

    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = 'Qx7Za9Lp4Vm2Kr8Nj5Hs6Dt3Bw1Cy0Fu7Eg9Ra2';
    prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
    await prisma.$connect();
    await prisma.user.createMany({
      data: [
        user(userOneId, `runtime-one-${suffix}@example.test`, UserRole.ADMIN),
        user(userMultipleId, `runtime-multiple-${suffix}@example.test`),
        user(userLegacyId, `runtime-legacy-${suffix}@example.test`),
      ],
    });
    await prisma.organization.createMany({
      data: [
        organization(organizationOneId, `runtime-one-${suffix}`),
        organization(organizationMultipleOneId, `runtime-m1-${suffix}`),
        organization(organizationMultipleTwoId, `runtime-m2-${suffix}`),
      ],
    });
    await prisma.organizationMembership.createMany({
      data: [
        membership(userOneId, organizationOneId, MembershipRole.PSYCHOLOGIST),
        membership(userMultipleId, organizationMultipleOneId),
        membership(
          userMultipleId,
          organizationMultipleTwoId,
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
    const appPrisma = app.get(PrismaService);
    const [fixtureMembership, appMembership] = await Promise.all([
      prisma.organizationMembership.findFirst({
        where: { userId: userOneId, organizationId: organizationOneId },
      }),
      appPrisma.organizationMembership.findFirst({
        where: { userId: userOneId, organizationId: organizationOneId },
      }),
    ]);
    expect(fixtureMembership).toMatchObject({
      userId: userOneId,
      organizationId: organizationOneId,
      status: 'ACTIVE',
    });
    expect(appMembership).toEqual(fixtureMembership);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.organizationMembership.deleteMany({
      where: { userId: { in: [userOneId, userMultipleId, userLegacyId] } },
    });
    await prisma?.organization.deleteMany({
      where: {
        id: {
          in: [
            organizationOneId,
            organizationMultipleOneId,
            organizationMultipleTwoId,
          ],
        },
      },
    });
    await prisma?.user.deleteMany({
      where: { id: { in: [userOneId, userMultipleId, userLegacyId] } },
    });
    await prisma?.$disconnect();
  });

  it('runs JWT then tenant resolution before the optional auth context controller', async () => {
    await request(app.getHttpServer()).get('/auth/context').expect(401);

    const single = await request(app.getHttpServer())
      .get('/auth/context')
      .set('Authorization', bearerToken(userOneId, UserRole.ADMIN))
      .expect(200);
    expect(single.body).toMatchObject({
      status: 'RESOLVED',
      tenantContext: {
        organizationId: organizationOneId,
        organizationRole: MembershipRole.PSYCHOLOGIST,
        legacyUserRole: UserRole.ADMIN,
      },
    });
  });

  it('makes the auth context route optional to break the multi-membership bootstrap cycle', async () => {
    const unresolved = await request(app.getHttpServer())
      .get('/auth/context')
      .set('Authorization', bearerToken(userMultipleId, UserRole.PSYCHOLOGIST))
      .expect(200);
    const unresolvedBody: unknown = unresolved.body;
    expect(isUnresolvedTenantContextResponse(unresolvedBody)).toBe(true);
    if (!isUnresolvedTenantContextResponse(unresolvedBody)) {
      throw new Error('Expected an unresolved tenant context response');
    }
    expect(unresolvedBody.status).toBe('UNRESOLVED');
    expect(unresolvedBody.selectableMemberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ organizationId: organizationMultipleOneId }),
        expect.objectContaining({ organizationId: organizationMultipleTwoId }),
      ]),
    );

    const selected = await request(app.getHttpServer())
      .get('/auth/context')
      .set('Authorization', bearerToken(userMultipleId, UserRole.PSYCHOLOGIST))
      .set('X-Organization-Id', organizationMultipleTwoId)
      .expect(200);
    expect(selected.body).toMatchObject({
      status: 'RESOLVED',
      tenantContext: { organizationId: organizationMultipleTwoId },
    });
  });

  it('permits legacy compatibility and rejects a foreign selection with the same redacted policy', async () => {
    const legacy = await request(app.getHttpServer())
      .get('/auth/context')
      .set('Authorization', bearerToken(userLegacyId, UserRole.PSYCHOLOGIST))
      .expect(200);
    expect(legacy.body).toMatchObject({ status: 'LEGACY_COMPATIBILITY' });
    await request(app.getHttpServer())
      .get('/auth/context')
      .set('Authorization', bearerToken(userOneId, UserRole.ADMIN))
      .set('X-Organization-Id', organizationMultipleOneId)
      .expect(403);
  });

  function bearerToken(userId: string, role: UserRole) {
    return `Bearer ${jwtService.sign({
      sub: userId,
      name: 'Legacy JWT User',
      email: 'legacy-jwt@example.test',
      role,
    })}`;
  }
});

function user(
  id: string,
  email: string,
  role: UserRole = UserRole.PSYCHOLOGIST,
) {
  return {
    id,
    name: 'Runtime Tenant User',
    email,
    passwordHash: 'not-a-real-password',
    role,
  };
}

function organization(id: string, slug: string) {
  return {
    id,
    slug,
    legalName: 'Runtime Tenant Organization',
    displayName: 'Runtime Tenant',
    status: OrganizationStatus.ACTIVE,
  };
}

function membership(
  userId: string,
  organizationId: string,
  role: MembershipRole = MembershipRole.PSYCHOLOGIST,
) {
  return {
    userId,
    organizationId,
    role,
    status: 'ACTIVE' as const,
    joinedAt: new Date(),
  };
}

type UnresolvedTenantContextResponse = {
  status: 'UNRESOLVED';
  selectableMemberships: ReadonlyArray<{ organizationId: string }>;
};

function isUnresolvedTenantContextResponse(
  value: unknown,
): value is UnresolvedTenantContextResponse {
  if (!isRecord(value) || value.status !== 'UNRESOLVED') {
    return false;
  }

  return (
    Array.isArray(value.selectableMemberships) &&
    value.selectableMemberships.every(
      (membership) =>
        isRecord(membership) && typeof membership.organizationId === 'string',
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
