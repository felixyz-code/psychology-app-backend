import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { TenantResolutionMode } from '../common/request-context/request-context.service';
import { TenantResolutionFailure } from './tenant-context.types';
import { TenantResolverService } from './tenant-resolver.service';

const describeCertification =
  process.env.RUN_TENANT_CERTIFICATION_TESTS === 'true'
    ? describe
    : describe.skip;

describeCertification('Tenant context PostgreSQL certification', () => {
  let prisma: PrismaClient;
  let resolver: TenantResolverService;
  const databaseUrl = process.env.DATABASE_URL;
  const suffix = randomUUID();
  const userA: TestUser = { id: randomUUID(), role: UserRole.ADMIN };
  const userB: TestUser = { id: randomUUID(), role: UserRole.PSYCHOLOGIST };
  const userC: TestUser = { id: randomUUID(), role: UserRole.PSYCHOLOGIST };
  const userD: TestUser = { id: randomUUID(), role: UserRole.PSYCHOLOGIST };
  const userE: TestUser = { id: randomUUID(), role: UserRole.PSYCHOLOGIST };
  const organizationA = randomUUID();
  const organizationB = randomUUID();
  const organizationCOne = randomUUID();
  const organizationCTwo = randomUUID();
  const organizationInactive = randomUUID();

  beforeAll(async () => {
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for tenant certification');
    }
    if (!new URL(databaseUrl).pathname.slice(1).endsWith('_test')) {
      throw new Error(
        'Tenant certification requires a database ending in _test',
      );
    }

    prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
    await prisma.$connect();
    resolver = new TenantResolverService(prisma as never);

    await prisma.user.createMany({
      data: [
        user(userA, `tenant-a-${suffix}@example.test`),
        user(userB, `tenant-b-${suffix}@example.test`),
        user(userC, `tenant-c-${suffix}@example.test`),
        user(userD, `tenant-d-${suffix}@example.test`),
        user(userE, `tenant-e-${suffix}@example.test`),
      ],
    });
    await prisma.organization.createMany({
      data: [
        organization(organizationA, `tenant-a-${suffix}`),
        organization(organizationB, `tenant-b-${suffix}`),
        organization(organizationCOne, `tenant-c1-${suffix}`),
        organization(organizationCTwo, `tenant-c2-${suffix}`),
        organization(
          organizationInactive,
          `tenant-inactive-${suffix}`,
          OrganizationStatus.SUSPENDED,
        ),
      ],
    });
    await prisma.organizationMembership.createMany({
      data: [
        membership(userA.id, organizationA, MembershipRole.PSYCHOLOGIST),
        membership(userB.id, organizationB),
        membership(userC.id, organizationCOne),
        membership(userC.id, organizationCTwo, MembershipRole.ADMIN),
        membership(
          userE.id,
          organizationB,
          MembershipRole.PSYCHOLOGIST,
          MembershipStatus.SUSPENDED,
        ),
        membership(userE.id, organizationInactive),
      ],
    });
  });

  afterAll(async () => {
    const userIds = [userA.id, userB.id, userC.id, userD.id, userE.id];
    const organizationIds = [
      organizationA,
      organizationB,
      organizationCOne,
      organizationCTwo,
      organizationInactive,
    ];
    await prisma?.organizationMembership.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma?.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
    await prisma?.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma?.$disconnect();
  });

  it('resolves an active single membership automatically and preserves legacy and membership roles', async () => {
    const resolution = await resolve(userA);
    expect(resolution.tenantContext).toMatchObject({
      organizationId: organizationA,
      organizationRole: MembershipRole.PSYCHOLOGIST,
      legacyUserRole: UserRole.ADMIN,
      resolutionMode: TenantResolutionMode.SINGLE_MEMBERSHIP,
    });
  });

  it('validates explicit selection and redacts both foreign and nonexistent organizations', async () => {
    const resolution = await resolve(userA, organizationA);
    expect(resolution.tenantContext).toMatchObject({
      organizationId: organizationA,
      resolutionMode: TenantResolutionMode.EXPLICIT,
    });
    const foreign = await errorFor(userA, organizationB);
    const missing = await errorFor(userA, randomUUID());
    expect(foreign).toEqual(missing);
    expect(foreign).toEqual({
      status: 403,
      message: 'Organization access denied',
    });
  });

  it('rejects invalid and multiple header values without querying organization authority from a client value', async () => {
    await expect(
      resolver.resolve(toAuthenticatedUser(userA), {
        headers: { 'x-organization-id': 'invalid' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      resolver.resolve(toAuthenticatedUser(userA), {
        headers: {},
        rawHeaders: [
          'X-Organization-Id',
          organizationA,
          'x-organization-id',
          organizationB,
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects inactive memberships and inactive organizations', async () => {
    await expect(resolve(userE, organizationB)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(resolve(userE, organizationInactive)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('never guesses a multi-membership selection but resolves a valid explicit choice', async () => {
    await expect(resolve(userC)).resolves.toEqual({
      failure: TenantResolutionFailure.AMBIGUOUS_MEMBERSHIPS,
    });
    const resolution = await resolve(userC, organizationCTwo);
    expect(resolution.tenantContext).toMatchObject({
      organizationId: organizationCTwo,
      organizationRole: MembershipRole.ADMIN,
    });
  });

  it('keeps an authenticated legacy user without memberships unresolved', async () => {
    await expect(resolve(userD)).resolves.toEqual({
      failure: TenantResolutionFailure.NO_ACTIVE_MEMBERSHIP,
    });
  });

  function resolve(currentUser: TestUser, organizationId?: string) {
    return resolver.resolve(toAuthenticatedUser(currentUser), {
      headers: organizationId ? { 'x-organization-id': organizationId } : {},
    });
  }

  async function errorFor(currentUser: TestUser, organizationId: string) {
    try {
      await resolve(currentUser, organizationId);
      throw new Error('Expected selection to fail');
    } catch (error) {
      const exception = error as ForbiddenException;
      return { status: exception.getStatus(), message: exception.message };
    }
  }
});

type TestUser = { id: string; role: UserRole };

function user(currentUser: TestUser, email: string) {
  return {
    id: currentUser.id,
    name: 'Tenant Certification User',
    email,
    passwordHash: 'not-a-real-password',
    role: currentUser.role,
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
    legalName: 'Tenant Certification Organization',
    displayName: 'Tenant Certification',
    status,
  };
}

function membership(
  userId: string,
  organizationId: string,
  role: MembershipRole = MembershipRole.PSYCHOLOGIST,
  status: MembershipStatus = MembershipStatus.ACTIVE,
) {
  return { userId, organizationId, role, status, joinedAt: new Date() };
}

function toAuthenticatedUser(currentUser: TestUser): AuthenticatedUser {
  return {
    id: currentUser.id,
    name: 'Legacy token user',
    email: 'legacy-token@example.test',
    role: currentUser.role,
  };
}
