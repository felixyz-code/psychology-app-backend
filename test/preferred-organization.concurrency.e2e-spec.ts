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
import { normalizeEmailIdentity } from '../src/common/identity/email-identity.util';
import { TenantObservabilityService } from '../src/tenant-context/tenant-observability.service';

const describeCertification =
  process.env.RUN_TENANT_CERTIFICATION_TESTS === 'true'
    ? describe
    : describe.skip;

jest.setTimeout(60_000);

describeCertification('Preferred organization concurrency runtime', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let jwtService: JwtService;
  let moduleRef: TestingModule;
  let observability: TenantObservabilityService;
  let preferenceSpy: jest.SpyInstance;
  let activeLockRelease: null | (() => Promise<void>) = null;
  const databaseUrl = process.env.DATABASE_URL;
  const suffix = randomUUID();

  const organizationAId = randomUUID();
  const organizationBId = randomUUID();
  const ownerUserId = randomUUID();
  const actorUserId = randomUUID();

  const ownerMembershipAId = randomUUID();
  const actorMembershipAId = randomUUID();
  const actorMembershipBId = randomUUID();

  beforeAll(async () => {
    if (
      !databaseUrl ||
      !new URL(databaseUrl).pathname.slice(1).endsWith('_test')
    ) {
      throw new Error(
        'Preferred organization concurrency E2E requires DATABASE_URL ending in _test',
      );
    }

    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = 'preferred-organization-concurrency-jwt-key-2026';
    prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
    await prisma.$connect();

    await prisma.organization.createMany({
      data: [
        organization(organizationAId, `preferred-concurrency-a-${suffix}`),
        organization(organizationBId, `preferred-concurrency-b-${suffix}`),
      ],
    });
    await prisma.user.createMany({
      data: [
        user(
          ownerUserId,
          `preferred-owner-${suffix}@example.test`,
          UserRole.ADMIN,
        ),
        user(actorUserId, `preferred-actor-${suffix}@example.test`),
      ],
    });
    await prisma.organizationMembership.createMany({
      data: [
        membership(
          ownerMembershipAId,
          ownerUserId,
          organizationAId,
          MembershipRole.OWNER,
          MembershipStatus.ACTIVE,
        ),
        membership(
          actorMembershipAId,
          actorUserId,
          organizationAId,
          MembershipRole.PSYCHOLOGIST,
          MembershipStatus.ACTIVE,
        ),
        membership(
          actorMembershipBId,
          actorUserId,
          organizationBId,
          MembershipRole.PSYCHOLOGIST,
          MembershipStatus.ACTIVE,
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
    preferenceSpy = jest.spyOn(
      observability,
      'activeOrganizationPreferenceChanged',
    );
  });

  afterEach(async () => {
    if (activeLockRelease) {
      await activeLockRelease();
      activeLockRelease = null;
    }
    preferenceSpy.mockClear();
    await prisma.user.update({
      where: { id: actorUserId },
      data: { preferredOrganizationId: null },
    });
    await prisma.organizationMembership.updateMany({
      where: { id: actorMembershipAId },
      data: {
        status: MembershipStatus.ACTIVE,
        suspendedAt: null,
        revokedAt: null,
      },
    });
    await prisma.organizationMembership.updateMany({
      where: { id: actorMembershipBId },
      data: {
        status: MembershipStatus.ACTIVE,
        suspendedAt: null,
        revokedAt: null,
      },
    });
    await prisma.organization.updateMany({
      where: { id: organizationAId },
      data: { status: OrganizationStatus.ACTIVE },
    });
  });

  afterAll(async () => {
    if (activeLockRelease) {
      await activeLockRelease();
      activeLockRelease = null;
    }
    preferenceSpy.mockRestore();
    await app?.close();
    await prisma?.organizationMembership.deleteMany({
      where: {
        id: {
          in: [ownerMembershipAId, actorMembershipAId, actorMembershipBId],
        },
      },
    });
    await prisma?.user.deleteMany({
      where: { id: { in: [ownerUserId, actorUserId] } },
    });
    await prisma?.organization.deleteMany({
      where: { id: { in: [organizationAId, organizationBId] } },
    });
    await prisma?.$disconnect();
  });

  it('keeps the final preference aligned with one successful write when set A races set B', async () => {
    const release = await lockTables(['users']);
    const token = bearerToken(actorUserId, UserRole.PSYCHOLOGIST);

    const setA = trackRequest(
      request(app.getHttpServer())
        .put('/auth/context/preference')
        .set('Authorization', token)
        .send({ organizationId: organizationAId }),
    );
    const setB = trackRequest(
      request(app.getHttpServer())
        .put('/auth/context/preference')
        .set('Authorization', token)
        .send({ organizationId: organizationBId }),
    );

    await expectBothPending(setA, setB);
    await release();

    const [responseA, responseB] = await Promise.all([
      setA.promise,
      setB.promise,
    ]);
    const successfulPreference = latestSuccessfulPreference([
      {
        label: 'setA',
        requestedPreference: organizationAId,
        response: responseA,
        completedAt: setA.completedAt(),
      },
      {
        label: 'setB',
        requestedPreference: organizationBId,
        response: responseB,
        completedAt: setB.completedAt(),
      },
    ]);

    const persisted = await prisma.user.findUniqueOrThrow({
      where: { id: actorUserId },
      select: { preferredOrganizationId: true },
    });
    expect(persisted.preferredOrganizationId).toBe(successfulPreference);
    await expectUnresolvedContext(token, successfulPreference);
    await expectMembershipAuthorityUnchanged();
    expect(successPreferenceEvents()).toBe(
      [responseA, responseB].filter((response) => response.status === 200)
        .length,
    );
  });

  it('never grants authority when a set races membership suspension', async () => {
    const release = await lockTables(['organization_memberships']);

    const setPreference = trackRequest(
      request(app.getHttpServer())
        .put('/auth/context/preference')
        .set('Authorization', bearerToken(actorUserId, UserRole.PSYCHOLOGIST))
        .send({ organizationId: organizationAId }),
    );
    const suspendMembership = trackRequest(
      request(app.getHttpServer())
        .patch(
          `/organizations/${organizationAId}/memberships/${actorMembershipAId}/status`,
        )
        .set('Authorization', bearerToken(ownerUserId, UserRole.ADMIN))
        .set('X-Organization-Id', organizationAId)
        .send({ status: MembershipStatus.SUSPENDED }),
    );

    await expectBothPending(setPreference, suspendMembership);
    await release();

    const [setResponse, suspendResponse] = await Promise.all([
      setPreference.promise,
      suspendMembership.promise,
    ]);
    expect([200, 404, 409]).toContain(setResponse.status);
    expect([200, 409]).toContain(suspendResponse.status);

    const membershipState =
      await prisma.organizationMembership.findUniqueOrThrow({
        where: { id: actorMembershipAId },
        select: { status: true },
      });
    const persisted = await prisma.user.findUniqueOrThrow({
      where: { id: actorUserId },
      select: { preferredOrganizationId: true },
    });
    const context = await request(app.getHttpServer())
      .get('/auth/context')
      .set('Authorization', bearerToken(actorUserId, UserRole.PSYCHOLOGIST))
      .expect(200);

    if (membershipState.status === MembershipStatus.SUSPENDED) {
      expect(context.body).toMatchObject({
        preferredOrganizationId: null,
      });
      return;
    }

    expect(membershipState.status).toBe(MembershipStatus.ACTIVE);
    if (setResponse.status === 200) {
      expect(persisted.preferredOrganizationId).toBe(organizationAId);
      expect(context.body).toMatchObject({
        preferredOrganizationId: organizationAId,
      });
      return;
    }

    expect(persisted.preferredOrganizationId).toBeNull();
    expect(context.body).toMatchObject({
      preferredOrganizationId: null,
    });
  });

  it('never grants authority when a set races organization suspension', async () => {
    const release = await lockTables(['organizations']);

    const setPreference = trackRequest(
      request(app.getHttpServer())
        .put('/auth/context/preference')
        .set('Authorization', bearerToken(actorUserId, UserRole.PSYCHOLOGIST))
        .send({ organizationId: organizationAId }),
    );
    const suspendOrganization = trackRequest(
      request(app.getHttpServer())
        .patch(`/organizations/${organizationAId}/status`)
        .set('Authorization', bearerToken(ownerUserId, UserRole.ADMIN))
        .set('X-Organization-Id', organizationAId)
        .send({ status: OrganizationStatus.SUSPENDED }),
    );

    await expectBothPending(setPreference, suspendOrganization);
    await release();

    const [setResponse, suspendResponse] = await Promise.all([
      setPreference.promise,
      suspendOrganization.promise,
    ]);
    expect([200, 404, 409]).toContain(setResponse.status);
    expect([200, 409]).toContain(suspendResponse.status);

    const organizationState = await prisma.organization.findUniqueOrThrow({
      where: { id: organizationAId },
      select: { status: true },
    });
    const persisted = await prisma.user.findUniqueOrThrow({
      where: { id: actorUserId },
      select: { preferredOrganizationId: true },
    });
    const context = await request(app.getHttpServer())
      .get('/auth/context')
      .set('Authorization', bearerToken(actorUserId, UserRole.PSYCHOLOGIST))
      .expect(200);

    if (organizationState.status === OrganizationStatus.SUSPENDED) {
      expect(context.body).toMatchObject({
        preferredOrganizationId: null,
      });
      return;
    }

    expect(organizationState.status).toBe(OrganizationStatus.ACTIVE);
    if (setResponse.status === 200) {
      expect(persisted.preferredOrganizationId).toBe(organizationAId);
      expect(context.body).toMatchObject({
        preferredOrganizationId: organizationAId,
      });
      return;
    }

    expect(persisted.preferredOrganizationId).toBeNull();
    expect(context.body).toMatchObject({
      preferredOrganizationId: null,
    });
  });

  it('keeps the final preference aligned with the last successful clear-or-set outcome', async () => {
    await prisma.user.update({
      where: { id: actorUserId },
      data: { preferredOrganizationId: organizationAId },
    });

    const release = await lockTables(['users']);
    const token = bearerToken(actorUserId, UserRole.PSYCHOLOGIST);

    const clearPreference = trackRequest(
      request(app.getHttpServer())
        .put('/auth/context/preference')
        .set('Authorization', token)
        .send({ organizationId: null }),
    );
    const setPreference = trackRequest(
      request(app.getHttpServer())
        .put('/auth/context/preference')
        .set('Authorization', token)
        .send({ organizationId: organizationBId }),
    );

    await expectBothPending(clearPreference, setPreference);
    await release();

    const [clearResponse, setResponse] = await Promise.all([
      clearPreference.promise,
      setPreference.promise,
    ]);
    const successfulPreference = latestSuccessfulPreference([
      {
        label: 'clearPreference',
        requestedPreference: null,
        response: clearResponse,
        completedAt: clearPreference.completedAt(),
      },
      {
        label: 'setPreference',
        requestedPreference: organizationBId,
        response: setResponse,
        completedAt: setPreference.completedAt(),
      },
    ]);

    const persisted = await prisma.user.findUniqueOrThrow({
      where: { id: actorUserId },
      select: { preferredOrganizationId: true },
    });
    expect(persisted.preferredOrganizationId).toBe(successfulPreference);
    await expectUnresolvedContext(token, successfulPreference);
    await expectMembershipAuthorityUnchanged();
    expect(successPreferenceEvents()).toBe(
      [clearResponse, setResponse].filter((response) => response.status === 200)
        .length,
    );
  });

  async function lockTables(tables: string[]) {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query('BEGIN');
    for (const table of tables) {
      await client.query(`LOCK TABLE ${table} IN ACCESS EXCLUSIVE MODE`);
    }

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

  function successPreferenceEvents() {
    return preferenceSpy.mock.calls.filter(([outcome]) => outcome === 'SUCCESS')
      .length;
  }

  async function expectUnresolvedContext(
    token: string,
    expectedPreference: string | null,
  ) {
    const response = await request(app.getHttpServer())
      .get('/auth/context')
      .set('Authorization', token)
      .expect(200);
    const body = response.body as {
      status: string;
      preferredOrganizationId: string | null;
      selectableMemberships: unknown[];
    };

    expect(body).toMatchObject({
      status: 'UNRESOLVED',
      preferredOrganizationId: expectedPreference,
    });
    expect(body.selectableMemberships).toHaveLength(2);
  }

  async function expectMembershipAuthorityUnchanged() {
    const memberships = await prisma.organizationMembership.findMany({
      where: { userId: actorUserId },
      orderBy: [{ organizationId: 'asc' }, { id: 'asc' }],
      select: {
        organizationId: true,
        role: true,
        status: true,
      },
    });

    expect(memberships).toEqual([
      {
        organizationId: organizationAId,
        role: MembershipRole.PSYCHOLOGIST,
        status: MembershipStatus.ACTIVE,
      },
      {
        organizationId: organizationBId,
        role: MembershipRole.PSYCHOLOGIST,
        status: MembershipStatus.ACTIVE,
      },
    ]);
  }

  function bearerToken(userId: string, role: UserRole) {
    return `Bearer ${jwtService.sign({
      sub: userId,
      name: 'Preferred Organization Concurrency User',
      email: 'preferred-organization-concurrency@example.test',
      role,
    })}`;
  }
});

function trackRequest<T>(promise: PromiseLike<T>) {
  let settled = false;
  let completedAt: bigint | null = null;
  const trackedPromise = Promise.resolve(promise).finally(() => {
    settled = true;
    completedAt = process.hrtime.bigint();
  });

  return {
    promise: trackedPromise,
    isSettled: () => settled,
    completedAt: () => completedAt,
  };
}

function latestSuccessfulPreference(
  operations: Array<{
    label: string;
    requestedPreference: string | null;
    response: { status: number };
    completedAt: bigint | null;
  }>,
) {
  const successful = operations.filter(
    (operation) => operation.response.status === 200,
  );

  expect(successful.length).toBeGreaterThanOrEqual(1);
  successful.forEach((operation) => {
    expect(operation.completedAt).not.toBeNull();
  });

  return successful
    .sort((left, right) => {
      const leftCompletedAt = left.completedAt ?? 0n;
      const rightCompletedAt = right.completedAt ?? 0n;

      if (leftCompletedAt === rightCompletedAt) {
        return left.label.localeCompare(right.label);
      }

      return leftCompletedAt < rightCompletedAt ? -1 : 1;
    })
    .at(-1)!.requestedPreference;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function user(
  id: string,
  email: string,
  role: UserRole = UserRole.PSYCHOLOGIST,
) {
  return {
    id,
    name: 'Preferred Organization Concurrency User',
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
    legalName: 'Preferred Organization Concurrency Legal Name',
    displayName: 'Preferred Organization Concurrency',
    status,
  };
}

function membership(
  id: string,
  userId: string,
  organizationId: string,
  role: MembershipRole,
  status: MembershipStatus,
) {
  return {
    id,
    userId,
    organizationId,
    role,
    status,
    joinedAt:
      status === MembershipStatus.ACTIVE
        ? new Date('2026-08-02T00:00:00.000Z')
        : null,
  };
}
