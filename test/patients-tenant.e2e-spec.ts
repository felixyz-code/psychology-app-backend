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
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

const describeCertification =
  process.env.RUN_PATIENTS_TENANT_CERTIFICATION_TESTS === 'true'
    ? describe
    : describe.skip;

type PatientHttpBody = {
  id: string;
};

describeCertification('Patients tenant-aware HTTP certification', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let jwtService: JwtService;
  const databaseUrl = process.env.DATABASE_URL;
  const suffix = randomUUID();
  const organizationAId = randomUUID();
  const organizationBId = randomUUID();
  const membershipAId = randomUUID();
  const membershipBId = randomUUID();
  const membershipSharedAId = randomUUID();
  const membershipSharedBId = randomUUID();
  const membershipAdminAId = randomUUID();
  const membershipAuditorAId = randomUUID();
  const membershipReadOnlyAId = randomUUID();
  const membershipSuspendedAId = randomUUID();
  const organizationSuspendedId = randomUUID();
  const membershipSuspendedOrgId = randomUUID();
  const psychologistAId = randomUUID();
  const psychologistBId = randomUUID();
  const psychologistSharedId = randomUUID();
  const adminAId = randomUUID();
  const auditorAId = randomUUID();
  const readOnlyAId = randomUUID();
  const suspendedMemberAId = randomUUID();
  const suspendedOrgUserId = randomUUID();
  const outsiderId = randomUUID();
  const patientA1Id = randomUUID();
  const patientA2Id = randomUUID();
  const patientB1Id = randomUUID();
  const patientAOtherId = randomUUID();
  const patientNullId = randomUUID();
  const patientSharedAId = randomUUID();
  const patientSharedBId = randomUUID();
  const patientOwnerUnassignedId = randomUUID();
  const patientAdminUnassignedId = randomUUID();
  const patientAuditorUnassignedId = randomUUID();
  const patientReadOnlyUnassignedId = randomUUID();
  const createdPatientIds: string[] = [];
  const password = 'PatientTenantTestPassword1!';

  beforeAll(async () => {
    if (
      !databaseUrl ||
      !new URL(databaseUrl).pathname.slice(1).endsWith('_test')
    ) {
      throw new Error(
        'Patients tenant certification requires DATABASE_URL ending in _test',
      );
    }

    process.env.JWT_SECRET = 'Qx7Za9Lp4Vm2Kr8Nj5Hs6Dt3Bw1Cy0Fu7Eg9Ra2';
    prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
    await prisma.$connect();
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.createMany({
      data: [
        user(psychologistAId, `patient-a-${suffix}@example.test`, passwordHash),
        user(psychologistBId, `patient-b-${suffix}@example.test`),
        user(psychologistSharedId, `patient-shared-${suffix}@example.test`),
        user(adminAId, `patient-admin-${suffix}@example.test`),
        user(auditorAId, `patient-auditor-${suffix}@example.test`),
        user(readOnlyAId, `patient-read-only-${suffix}@example.test`),
        user(suspendedMemberAId, `patient-suspended-${suffix}@example.test`),
        user(
          suspendedOrgUserId,
          `patient-suspended-org-${suffix}@example.test`,
        ),
        user(outsiderId, `patient-outsider-${suffix}@example.test`),
      ],
    });
    await prisma.organization.createMany({
      data: [
        organization(organizationAId, `patients-a-${suffix}`),
        organization(organizationBId, `patients-b-${suffix}`),
        organization(
          organizationSuspendedId,
          `patients-suspended-${suffix}`,
          OrganizationStatus.SUSPENDED,
        ),
      ],
    });
    await prisma.organizationMembership.createMany({
      data: [
        membership(
          membershipAId,
          psychologistAId,
          organizationAId,
          MembershipRole.OWNER,
        ),
        membership(membershipBId, psychologistBId, organizationBId),
        membership(membershipSharedAId, psychologistSharedId, organizationAId),
        membership(membershipSharedBId, psychologistSharedId, organizationBId),
        membership(
          membershipAdminAId,
          adminAId,
          organizationAId,
          MembershipRole.ADMIN,
        ),
        membership(
          membershipAuditorAId,
          auditorAId,
          organizationAId,
          MembershipRole.AUDITOR,
        ),
        membership(
          membershipReadOnlyAId,
          readOnlyAId,
          organizationAId,
          MembershipRole.READ_ONLY,
        ),
        membership(
          membershipSuspendedAId,
          suspendedMemberAId,
          organizationAId,
          MembershipRole.PSYCHOLOGIST,
          MembershipStatus.SUSPENDED,
        ),
        membership(
          membershipSuspendedOrgId,
          suspendedOrgUserId,
          organizationSuspendedId,
        ),
      ],
    });
    await prisma.patient.createMany({
      data: [
        patient(patientA1Id, organizationAId, psychologistAId, 'A1'),
        patient(patientA2Id, organizationAId, psychologistAId, 'A2'),
        patient(patientB1Id, organizationBId, psychologistBId, 'B1'),
        patient(patientAOtherId, organizationAId, psychologistBId, 'A-other'),
        patient(patientNullId, null, psychologistAId, 'A-null'),
        patient(
          patientSharedAId,
          organizationAId,
          psychologistSharedId,
          'Shared-A',
        ),
        patient(
          patientSharedBId,
          organizationBId,
          psychologistSharedId,
          'Shared-B',
        ),
        patient(
          patientOwnerUnassignedId,
          organizationAId,
          psychologistAId,
          'Owner-unassigned',
        ),
        patient(
          patientAdminUnassignedId,
          organizationAId,
          adminAId,
          'Admin-unassigned',
        ),
        patient(
          patientAuditorUnassignedId,
          organizationAId,
          auditorAId,
          'Auditor-unassigned',
        ),
        patient(
          patientReadOnlyUnassignedId,
          organizationAId,
          readOnlyAId,
          'Read-only-unassigned',
        ),
      ],
    });
    await prisma.patientAssignment.createMany({
      data: [
        assignment(organizationAId, patientA1Id, membershipAId),
        assignment(organizationAId, patientA2Id, membershipAId),
        assignment(organizationBId, patientB1Id, membershipBId),
        assignment(organizationAId, patientAOtherId, membershipBId),
        assignment(organizationAId, patientNullId, membershipAId),
        assignment(organizationAId, patientSharedAId, membershipSharedAId),
        assignment(organizationBId, patientSharedBId, membershipSharedBId),
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
        patientId: {
          in: [
            patientA1Id,
            patientA2Id,
            patientB1Id,
            patientAOtherId,
            patientNullId,
            patientSharedAId,
            patientSharedBId,
            patientOwnerUnassignedId,
            patientAdminUnassignedId,
            patientAuditorUnassignedId,
            patientReadOnlyUnassignedId,
            ...createdPatientIds,
          ],
        },
      },
    });
    await prisma?.patient.deleteMany({
      where: {
        id: {
          in: [
            patientA1Id,
            patientA2Id,
            patientB1Id,
            patientAOtherId,
            patientNullId,
            patientSharedAId,
            patientSharedBId,
            patientOwnerUnassignedId,
            patientAdminUnassignedId,
            patientAuditorUnassignedId,
            patientReadOnlyUnassignedId,
            ...createdPatientIds,
          ],
        },
      },
    });
    await prisma?.organizationMembership.deleteMany({
      where: {
        userId: {
          in: [
            psychologistAId,
            psychologistBId,
            psychologistSharedId,
            adminAId,
            auditorAId,
            readOnlyAId,
            suspendedMemberAId,
            suspendedOrgUserId,
          ],
        },
      },
    });
    await prisma?.organization.deleteMany({
      where: {
        id: { in: [organizationAId, organizationBId, organizationSuspendedId] },
      },
    });
    await prisma?.user.deleteMany({
      where: {
        id: {
          in: [
            psychologistAId,
            psychologistBId,
            psychologistSharedId,
            adminAId,
            auditorAId,
            readOnlyAId,
            suspendedMemberAId,
            suspendedOrgUserId,
            outsiderId,
          ],
        },
      },
    });
    await prisma?.$disconnect();
  });

  it('authenticates through login without tenant leakage in the token flow', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: `patient-a-${suffix}@example.test`,
        password,
      })
      .expect(201);
    const token = accessToken(loginResponse.body);

    const contextResponse = await request(app.getHttpServer())
      .get('/auth/context')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(contextResponse.body).toMatchObject({
      status: 'RESOLVED',
      tenantContext: {
        userId: psychologistAId,
        organizationId: organizationAId,
        membershipId: membershipAId,
        organizationRole: MembershipRole.OWNER,
      },
    });
    const contextBody: unknown = contextResponse.body;
    if (!isRecord(contextBody) || !isRecord(contextBody.tenantContext)) {
      throw new Error('Expected resolved tenant context response');
    }
    expect(contextBody.tenantContext).not.toHaveProperty('accessToken');
  });

  it('applies both ownership barriers to list, detail, create, update, and delete', async () => {
    const tokenA = bearerToken(psychologistAId);
    const listed = await request(app.getHttpServer())
      .get('/patients')
      .set('Authorization', tokenA)
      .expect(200);
    const listedBody: unknown = listed.body;
    expect(patientIds(listedBody).sort()).toEqual(
      [patientA1Id, patientA2Id].sort(),
    );

    await request(app.getHttpServer())
      .get(`/patients/${patientB1Id}`)
      .set('Authorization', tokenA)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/patients/${patientAOtherId}`)
      .set('Authorization', tokenA)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/patients/${patientNullId}`)
      .set('Authorization', tokenA)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/patients/${patientB1Id}`)
      .set('Authorization', tokenA)
      .send({ firstName: 'Blocked' })
      .expect(404);
    const blockedUpdate = await prisma.patient.findUniqueOrThrow({
      where: { id: patientB1Id },
    });
    expect(blockedUpdate.firstName).toBe('B1');
    await request(app.getHttpServer())
      .delete(`/patients/${patientAOtherId}`)
      .set('Authorization', tokenA)
      .expect(404);
    const blockedDelete = await prisma.patient.findUniqueOrThrow({
      where: { id: patientAOtherId },
    });
    expect(blockedDelete.firstName).toBe('A-other');

    const created = await request(app.getHttpServer())
      .post('/patients')
      .set('Authorization', tokenA)
      .send({
        firstName: 'Created',
        lastName: 'Scoped',
        organizationId: organizationBId,
        psychologistId: psychologistBId,
      })
      .expect(201);
    const createdBody: unknown = created.body;
    const createdPatient = patientResponse(createdBody);
    const persistedCreated = await prisma.patient.findUniqueOrThrow({
      where: { id: createdPatient.id },
    });
    const persistedAssignment = await prisma.patientAssignment.findFirstOrThrow(
      {
        where: {
          organizationId: organizationAId,
          patientId: createdPatient.id,
          membershipId: membershipAId,
          status: PatientAssignmentStatus.ACTIVE,
        },
      },
    );
    expect(persistedCreated).toMatchObject({
      organizationId: organizationAId,
      psychologistId: psychologistAId,
    });
    expect(persistedAssignment).toMatchObject({
      role: PatientAssignmentRole.PRIMARY,
      createdByMembershipId: membershipAId,
    });
    createdPatientIds.push(createdPatient.id);

    await request(app.getHttpServer())
      .patch(`/patients/${createdPatient.id}`)
      .set('Authorization', tokenA)
      .send({
        firstName: 'Updated',
        organizationId: organizationBId,
        psychologistId: psychologistBId,
      })
      .expect(200);
    const updated = await prisma.patient.findUniqueOrThrow({
      where: { id: createdPatient.id },
    });
    expect(updated).toMatchObject({
      firstName: 'Updated',
      organizationId: organizationAId,
      psychologistId: psychologistAId,
    });

    await request(app.getHttpServer())
      .delete(`/patients/${createdPatient.id}`)
      .set('Authorization', tokenA)
      .expect(200);
  });

  it('denies roles without patient capability or required assignment', async () => {
    const tokenA = bearerToken(psychologistAId);
    await request(app.getHttpServer())
      .get(`/patients/${patientOwnerUnassignedId}`)
      .set('Authorization', tokenA)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/patients/${patientAdminUnassignedId}`)
      .set('Authorization', bearerToken(adminAId))
      .expect(403);

    await request(app.getHttpServer())
      .get(`/patients/${patientAuditorUnassignedId}`)
      .set('Authorization', bearerToken(auditorAId))
      .expect(403);

    await request(app.getHttpServer())
      .get(`/patients/${patientReadOnlyUnassignedId}`)
      .set('Authorization', bearerToken(readOnlyAId))
      .expect(403);
  });

  it('rejects suspended membership and suspended organization contexts', async () => {
    await request(app.getHttpServer())
      .get('/patients')
      .set('Authorization', bearerToken(suspendedMemberAId))
      .set('X-Organization-Id', organizationAId)
      .expect(403);

    await request(app.getHttpServer())
      .get('/patients')
      .set('Authorization', bearerToken(suspendedOrgUserId))
      .set('X-Organization-Id', organizationSuspendedId)
      .expect(403);
  });

  it('requires selection for multiple memberships and scopes the selected tenant', async () => {
    const sharedToken = bearerToken(psychologistSharedId);
    await request(app.getHttpServer())
      .get('/patients')
      .set('Authorization', sharedToken)
      .expect(409);

    const inA = await request(app.getHttpServer())
      .get('/patients')
      .set('Authorization', sharedToken)
      .set('X-Organization-Id', organizationAId)
      .expect(200);
    const inABody: unknown = inA.body;
    expect(patientIds(inABody)).toEqual([patientSharedAId]);

    const inB = await request(app.getHttpServer())
      .get('/patients')
      .set('Authorization', sharedToken)
      .set('X-Organization-Id', organizationBId)
      .expect(200);
    const inBBody: unknown = inB.body;
    expect(patientIds(inBBody)).toEqual([patientSharedBId]);
  });

  it('redacts a foreign organization selection and resource existence', async () => {
    const outsiderToken = bearerToken(outsiderId);
    await request(app.getHttpServer())
      .get('/patients')
      .set('Authorization', outsiderToken)
      .set('X-Organization-Id', organizationBId)
      .expect(403);

    const tokenA = bearerToken(psychologistAId);
    const foreign = await request(app.getHttpServer())
      .get(`/patients/${patientB1Id}`)
      .set('Authorization', tokenA)
      .expect(404);
    const missing = await request(app.getHttpServer())
      .get(`/patients/${randomUUID()}`)
      .set('Authorization', tokenA)
      .expect(404);
    expect(foreign.body).toMatchObject({ error: 'Not Found', statusCode: 404 });
    expect(missing.body).toMatchObject({ error: 'Not Found', statusCode: 404 });
  });

  function bearerToken(userId: string) {
    return `Bearer ${jwtService.sign({
      sub: userId,
      name: 'Tenant Patient Test User',
      email: 'patient-tenant@example.test',
      role: UserRole.PSYCHOLOGIST,
    })}`;
  }
});

function user(id: string, email: string, passwordHash = 'not-a-real-password') {
  return {
    id,
    name: 'Tenant Patient Test User',
    email,
    passwordHash,
    role: UserRole.PSYCHOLOGIST,
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
    legalName: 'Tenant Patient Test Organization',
    displayName: 'Tenant Patient Test',
    status,
  };
}

function membership(
  id: string,
  userId: string,
  organizationId: string,
  role: MembershipRole = MembershipRole.PSYCHOLOGIST,
  status: MembershipStatus = MembershipStatus.ACTIVE,
) {
  return {
    id,
    userId,
    organizationId,
    role,
    status,
    joinedAt: new Date(),
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

function patient(
  id: string,
  organizationId: string | null,
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

function patientIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error('Expected an array response');
  }

  return value.map((item) => patientResponse(item).id);
}

function patientResponse(value: unknown): PatientHttpBody {
  if (!isRecord(value) || typeof value.id !== 'string') {
    throw new Error('Expected a patient response');
  }

  return {
    id: value.id,
  };
}

function accessToken(value: unknown): string {
  if (!isRecord(value) || typeof value.accessToken !== 'string') {
    throw new Error('Expected a login response with an access token');
  }

  return value.accessToken;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
