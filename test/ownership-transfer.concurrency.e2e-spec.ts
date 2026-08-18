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

describeCertification('Ownership transfer concurrency runtime', () => {
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
  const targetAUserId = randomUUID();
  const targetBUserId = randomUUID();

  const ownerMembershipId = randomUUID();
  const targetAMembershipId = randomUUID();
  const targetBMembershipId = randomUUID();

  beforeAll(async () => {
    if (
      !databaseUrl ||
      !new URL(databaseUrl).pathname.slice(1).endsWith('_test')
    ) {
      throw new Error(
        'Ownership transfer concurrency E2E requires DATABASE_URL ending in _test',
      );
    }

    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = 'ownership-transfer-concurrency-jwt-key-2026';
    prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
    await prisma.$connect();

    await prisma.user.createMany({
      data: [
        user(ownerUserId, `ownership-concurrency-owner-${suffix}@example.test`),
        user(targetAUserId, `ownership-concurrency-a-${suffix}@example.test`),
        user(targetBUserId, `ownership-concurrency-b-${suffix}@example.test`),
      ],
    });

    await prisma.organization.create({
      data: organization(organizationId, `ownership-concurrency-${suffix}`),
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
          targetAMembershipId,
          targetAUserId,
          organizationId,
          MembershipRole.ADMIN,
        ),
        membership(
          targetBMembershipId,
          targetBUserId,
          organizationId,
          MembershipRole.BILLING,
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
    await prisma.organizationMembership.updateMany({
      where: { id: targetAMembershipId },
      data: { role: MembershipRole.ADMIN, status: MembershipStatus.ACTIVE },
    });
    await prisma.organizationMembership.updateMany({
      where: { id: targetBMembershipId },
      data: { role: MembershipRole.BILLING, status: MembershipStatus.ACTIVE },
    });
    await prisma.organizationMembership.updateMany({
      where: { id: ownerMembershipId },
      data: { role: MembershipRole.OWNER, status: MembershipStatus.ACTIVE },
    });
  });

  afterAll(async () => {
    if (activeLockRelease) {
      await activeLockRelease();
      activeLockRelease = null;
    }
    eventSpy.mockRestore();
    await app?.close();
    await prisma?.organizationMembership.deleteMany({
      where: {
        id: {
          in: [ownerMembershipId, targetAMembershipId, targetBMembershipId],
        },
      },
    });
    await prisma?.organization.deleteMany({ where: { id: organizationId } });
    await prisma?.user.deleteMany({
      where: { id: { in: [ownerUserId, targetAUserId, targetBUserId] } },
    });
    await prisma?.$disconnect();
  });

  it('commits exactly one ownership transfer when the same owner races two targets', async () => {
    const release = await lockMembershipTable();

    const requestA = trackRequest(
      request(app.getHttpServer())
        .post(`/organizations/${organizationId}/ownership-transfer`)
        .set('Authorization', bearerToken(ownerUserId, UserRole.ADMIN))
        .set('X-Organization-Id', organizationId)
        .send({ targetMembershipId: targetAMembershipId }),
    );
    const requestB = trackRequest(
      request(app.getHttpServer())
        .post(`/organizations/${organizationId}/ownership-transfer`)
        .set('Authorization', bearerToken(ownerUserId, UserRole.ADMIN))
        .set('X-Organization-Id', organizationId)
        .send({ targetMembershipId: targetBMembershipId }),
    );

    await expectBothPending(requestA, requestB);
    await release();

    const [responseA, responseB] = await Promise.all([
      requestA.promise,
      requestB.promise,
    ]);
    expect([responseA.status, responseB.status].sort()).toEqual([200, 409]);

    const memberships = await prisma.organizationMembership.findMany({
      where: {
        organizationId,
      },
      select: {
        id: true,
        userId: true,
        role: true,
        status: true,
      },
      orderBy: { id: 'asc' },
    });

    expect(
      memberships.filter(
        (membership) =>
          membership.role === MembershipRole.OWNER &&
          membership.status === MembershipStatus.ACTIVE,
      ),
    ).toHaveLength(1);
    expect(
      memberships.find((membership) => membership.id === ownerMembershipId),
    ).toMatchObject({
      role: MembershipRole.ADMIN,
      status: MembershipStatus.ACTIVE,
    });
    expect(
      memberships.filter(
        (membership) =>
          membership.id !== ownerMembershipId &&
          membership.role === MembershipRole.OWNER,
      ),
    ).toHaveLength(1);
    expect(successEventCount('organization_ownership_transferred')).toBe(1);
  });

  async function lockMembershipTable() {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query('BEGIN');
    await client.query(
      'LOCK TABLE organization_memberships IN ACCESS EXCLUSIVE MODE',
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
      name: 'Ownership Transfer Concurrency User',
      email: 'ownership-transfer-concurrency@example.test',
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

function user(id: string, email: string) {
  return {
    id,
    name: 'Ownership Transfer Concurrency User',
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
    legalName: 'Ownership Transfer Concurrency Legal Name',
    displayName: 'Ownership Transfer Concurrency',
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
