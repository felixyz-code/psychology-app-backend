import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  PatientAssignmentRole,
  PatientAssignmentStatus,
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

describeCertification('Preferred organization UX runtime', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let jwtService: JwtService;
  const databaseUrl = process.env.DATABASE_URL;
  const suffix = randomUUID();

  const organizationAId = randomUUID();
  const organizationBId = randomUUID();
  const organizationSuspendedId = randomUUID();
  const organizationForeignId = randomUUID();

  const multiUserId = randomUUID();
  const singleUserId = randomUUID();
  const legacyUserId = randomUUID();
  const suspendedMembershipUserId = randomUUID();
  const suspendedOrgUserId = randomUUID();
  const revokedUserId = randomUUID();
  const foreignUserId = randomUUID();

  const multiMembershipAId = randomUUID();
  const multiMembershipBId = randomUUID();
  const singleMembershipAId = randomUUID();
  const suspendedMembershipId = randomUUID();
  const suspendedOrgMembershipId = randomUUID();
  const revokedMembershipId = randomUUID();
  const foreignMembershipId = randomUUID();

  const patientAId = randomUUID();
  const patientBId = randomUUID();

  beforeAll(async () => {
    if (
      !databaseUrl ||
      !new URL(databaseUrl).pathname.slice(1).endsWith('_test')
    ) {
      throw new Error(
        'Preferred organization E2E requires DATABASE_URL ending in _test',
      );
    }

    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = 'preferred-organization-jwt-key-2026';
    prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
    await prisma.$connect();

    await prisma.organization.createMany({
      data: [
        organization(organizationAId, `preferred-org-a-${suffix}`),
        organization(organizationBId, `preferred-org-b-${suffix}`),
        organization(
          organizationSuspendedId,
          `preferred-org-suspended-${suffix}`,
          OrganizationStatus.SUSPENDED,
        ),
        organization(organizationForeignId, `preferred-org-foreign-${suffix}`),
      ],
    });

    await prisma.user.createMany({
      data: [
        user(multiUserId, `preferred-multi-${suffix}@example.test`),
        user(
          singleUserId,
          `preferred-single-${suffix}@example.test`,
          organizationAId,
        ),
        user(legacyUserId, `preferred-legacy-${suffix}@example.test`),
        user(
          suspendedMembershipUserId,
          `preferred-suspended-membership-${suffix}@example.test`,
        ),
        user(
          suspendedOrgUserId,
          `preferred-suspended-org-${suffix}@example.test`,
          organizationSuspendedId,
        ),
        user(revokedUserId, `preferred-revoked-${suffix}@example.test`),
        user(foreignUserId, `preferred-foreign-${suffix}@example.test`),
      ],
    });

    await prisma.organizationMembership.createMany({
      data: [
        membership(
          multiMembershipAId,
          multiUserId,
          organizationAId,
          MembershipRole.PSYCHOLOGIST,
          MembershipStatus.ACTIVE,
        ),
        membership(
          multiMembershipBId,
          multiUserId,
          organizationBId,
          MembershipRole.PSYCHOLOGIST,
          MembershipStatus.ACTIVE,
        ),
        membership(
          singleMembershipAId,
          singleUserId,
          organizationAId,
          MembershipRole.PSYCHOLOGIST,
          MembershipStatus.ACTIVE,
        ),
        membership(
          suspendedMembershipId,
          suspendedMembershipUserId,
          organizationAId,
          MembershipRole.PSYCHOLOGIST,
          MembershipStatus.SUSPENDED,
        ),
        membership(
          suspendedOrgMembershipId,
          suspendedOrgUserId,
          organizationSuspendedId,
          MembershipRole.PSYCHOLOGIST,
          MembershipStatus.ACTIVE,
        ),
        membership(
          revokedMembershipId,
          revokedUserId,
          organizationAId,
          MembershipRole.PSYCHOLOGIST,
          MembershipStatus.REVOKED,
        ),
        membership(
          foreignMembershipId,
          foreignUserId,
          organizationForeignId,
          MembershipRole.OWNER,
          MembershipStatus.ACTIVE,
        ),
      ],
    });

    await prisma.patient.createMany({
      data: [
        patient(patientAId, organizationAId, multiUserId, 'Multi-A'),
        patient(patientBId, organizationBId, multiUserId, 'Multi-B'),
      ],
    });

    await prisma.patientAssignment.createMany({
      data: [
        assignment(organizationAId, patientAId, multiMembershipAId),
        assignment(organizationBId, patientBId, multiMembershipBId),
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
    await prisma?.patientAssignment.deleteMany({
      where: {
        patientId: { in: [patientAId, patientBId] },
      },
    });
    await prisma?.patient.deleteMany({
      where: {
        id: { in: [patientAId, patientBId] },
      },
    });
    await prisma?.organizationMembership.deleteMany({
      where: {
        id: {
          in: [
            multiMembershipAId,
            multiMembershipBId,
            singleMembershipAId,
            suspendedMembershipId,
            suspendedOrgMembershipId,
            revokedMembershipId,
            foreignMembershipId,
          ],
        },
      },
    });
    await prisma?.user.deleteMany({
      where: {
        id: {
          in: [
            multiUserId,
            singleUserId,
            legacyUserId,
            suspendedMembershipUserId,
            suspendedOrgUserId,
            revokedUserId,
            foreignUserId,
          ],
        },
      },
    });
    await prisma?.organization.deleteMany({
      where: {
        id: {
          in: [
            organizationAId,
            organizationBId,
            organizationSuspendedId,
            organizationForeignId,
          ],
        },
      },
    });
    await prisma?.$disconnect();
  });

  it('stores, rereads, switches, and clears the UX preference while keeping tenant authority on the header', async () => {
    const token = bearerToken(multiUserId);

    await request(app.getHttpServer())
      .get('/auth/context')
      .set('Authorization', token)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          status: 'UNRESOLVED',
          preferredOrganizationId: null,
        });
      });

    const preferA = await request(app.getHttpServer())
      .put('/auth/context/preference')
      .set('Authorization', token)
      .send({ organizationId: organizationAId })
      .expect(200);
    const preferABody = preferenceBody(preferA.body as unknown);
    expect(preferABody).toEqual({
      preferredOrganizationId: organizationAId,
    });
    expect(preferABody.accessToken).toBeUndefined();

    await request(app.getHttpServer())
      .get('/auth/context')
      .set('Authorization', token)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          status: 'UNRESOLVED',
          preferredOrganizationId: organizationAId,
        });
      });

    const selectedB = await request(app.getHttpServer())
      .get('/patients')
      .set('Authorization', token)
      .set('X-Organization-Id', organizationBId)
      .expect(200);
    expect(patientIds(selectedB.body)).toEqual([patientBId]);
    expect(
      preferenceBody(selectedB.body as unknown).accessToken,
    ).toBeUndefined();

    await request(app.getHttpServer())
      .get('/auth/context')
      .set('Authorization', token)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          status: 'UNRESOLVED',
          preferredOrganizationId: organizationAId,
        });
      });

    await request(app.getHttpServer())
      .put('/auth/context/preference')
      .set('Authorization', token)
      .send({ organizationId: organizationBId })
      .expect(200)
      .expect({
        preferredOrganizationId: organizationBId,
      });

    await request(app.getHttpServer())
      .get('/auth/context')
      .set('Authorization', token)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          status: 'UNRESOLVED',
          preferredOrganizationId: organizationBId,
        });
      });

    await request(app.getHttpServer())
      .put('/auth/context/preference')
      .set('Authorization', token)
      .send({ organizationId: null })
      .expect(200)
      .expect({
        preferredOrganizationId: null,
      });

    await request(app.getHttpServer())
      .get('/auth/context')
      .set('Authorization', token)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          status: 'UNRESOLVED',
          preferredOrganizationId: null,
        });
      });
  });

  it('returns the three auth-context variants and sanitizes stale persisted preferences to null on read', async () => {
    await request(app.getHttpServer())
      .get('/auth/context')
      .set('Authorization', bearerToken(singleUserId))
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          status: 'RESOLVED',
          preferredOrganizationId: organizationAId,
          tenantContext: {
            organizationId: organizationAId,
            membershipId: singleMembershipAId,
          },
        });
      });

    await request(app.getHttpServer())
      .get('/auth/context')
      .set('Authorization', bearerToken(legacyUserId))
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({
          status: 'LEGACY_COMPATIBILITY',
          selectableMemberships: [],
          preferredOrganizationId: null,
        });
      });

    await request(app.getHttpServer())
      .get('/auth/context')
      .set('Authorization', bearerToken(suspendedOrgUserId))
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          status: 'UNRESOLVED',
          selectableMemberships: [],
          preferredOrganizationId: null,
        });
      });
  });

  it('fails closed for inaccessible or inactive preference writes and leaves the previous preference unchanged', async () => {
    const multiToken = bearerToken(multiUserId);

    await request(app.getHttpServer())
      .put('/auth/context/preference')
      .set('Authorization', multiToken)
      .send({ organizationId: organizationAId })
      .expect(200);

    await request(app.getHttpServer())
      .put('/auth/context/preference')
      .set('Authorization', multiToken)
      .send({ organizationId: organizationForeignId })
      .expect(404);

    await request(app.getHttpServer())
      .get('/auth/context')
      .set('Authorization', multiToken)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          preferredOrganizationId: organizationAId,
        });
      });

    await request(app.getHttpServer())
      .put('/auth/context/preference')
      .set('Authorization', bearerToken(suspendedMembershipUserId))
      .send({ organizationId: organizationAId })
      .expect(404);

    await request(app.getHttpServer())
      .put('/auth/context/preference')
      .set('Authorization', bearerToken(revokedUserId))
      .send({ organizationId: organizationAId })
      .expect(404);

    await request(app.getHttpServer())
      .put('/auth/context/preference')
      .set('Authorization', bearerToken(suspendedOrgUserId))
      .send({ organizationId: organizationSuspendedId })
      .expect(404);
  });

  function bearerToken(userId: string) {
    return `Bearer ${jwtService.sign({
      sub: userId,
      name: 'Preferred Organization User',
      email: 'preferred-organization@example.test',
      role: UserRole.PSYCHOLOGIST,
    })}`;
  }
});

function user(
  id: string,
  email: string,
  preferredOrganizationId: string | null = null,
) {
  return {
    id,
    name: 'Preferred Organization User',
    email,
    normalizedEmail: normalizeEmailIdentity(email),
    passwordHash: 'not-a-real-password',
    role: UserRole.PSYCHOLOGIST,
    preferredOrganizationId,
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
    legalName: 'Preferred Organization Legal Name',
    displayName: 'Preferred Organization',
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
    suspendedAt:
      status === MembershipStatus.SUSPENDED
        ? new Date('2026-08-02T00:10:00.000Z')
        : null,
    revokedAt:
      status === MembershipStatus.REVOKED
        ? new Date('2026-08-02T00:20:00.000Z')
        : null,
  };
}

function patient(
  id: string,
  organizationId: string,
  psychologistId: string,
  firstName: string,
) {
  return {
    id,
    organizationId,
    psychologistId,
    firstName,
    lastName: 'Patient',
  };
}

function assignment(
  organizationId: string,
  patientId: string,
  membershipId: string,
) {
  return {
    organizationId,
    patientId,
    membershipId,
    role: PatientAssignmentRole.PRIMARY,
    status: PatientAssignmentStatus.ACTIVE,
    createdByMembershipId: membershipId,
  };
}

function patientIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error('Expected an array response');
  }

  return value.map((item) => {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof (item as { id?: unknown }).id !== 'string'
    ) {
      throw new Error('Expected a patient list item');
    }

    return (item as { id: string }).id;
  });
}

function preferenceBody(value: unknown): {
  preferredOrganizationId?: string | null;
  accessToken?: unknown;
} {
  if (!value || typeof value !== 'object') {
    throw new Error('Expected response object');
  }

  return value;
}
