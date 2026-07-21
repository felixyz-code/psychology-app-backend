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
  const psychologistAId = randomUUID();
  const psychologistBId = randomUUID();
  const psychologistSharedId = randomUUID();
  const outsiderId = randomUUID();
  const patientA1Id = randomUUID();
  const patientA2Id = randomUUID();
  const patientB1Id = randomUUID();
  const patientAOtherId = randomUUID();
  const patientNullId = randomUUID();
  const patientSharedAId = randomUUID();
  const patientSharedBId = randomUUID();
  const createdPatientIds: string[] = [];

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
    await prisma.user.createMany({
      data: [
        user(psychologistAId, `patient-a-${suffix}@example.test`),
        user(psychologistBId, `patient-b-${suffix}@example.test`),
        user(psychologistSharedId, `patient-shared-${suffix}@example.test`),
        user(outsiderId, `patient-outsider-${suffix}@example.test`),
      ],
    });
    await prisma.organization.createMany({
      data: [
        organization(organizationAId, `patients-a-${suffix}`),
        organization(organizationBId, `patients-b-${suffix}`),
      ],
    });
    await prisma.organizationMembership.createMany({
      data: [
        membership(psychologistAId, organizationAId),
        membership(psychologistBId, organizationBId),
        membership(psychologistSharedId, organizationAId),
        membership(psychologistSharedId, organizationBId),
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
            ...createdPatientIds,
          ],
        },
      },
    });
    await prisma?.organizationMembership.deleteMany({
      where: {
        userId: {
          in: [psychologistAId, psychologistBId, psychologistSharedId],
        },
      },
    });
    await prisma?.organization.deleteMany({
      where: { id: { in: [organizationAId, organizationBId] } },
    });
    await prisma?.user.deleteMany({
      where: {
        id: {
          in: [
            psychologistAId,
            psychologistBId,
            psychologistSharedId,
            outsiderId,
          ],
        },
      },
    });
    await prisma?.$disconnect();
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
    await request(app.getHttpServer())
      .delete(`/patients/${patientAOtherId}`)
      .set('Authorization', tokenA)
      .expect(404);

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
    expect(persistedCreated).toMatchObject({
      organizationId: organizationAId,
      psychologistId: psychologistAId,
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

function user(id: string, email: string) {
  return {
    id,
    name: 'Tenant Patient Test User',
    email,
    passwordHash: 'not-a-real-password',
    role: UserRole.PSYCHOLOGIST,
  };
}

function organization(id: string, slug: string) {
  return {
    id,
    slug,
    legalName: 'Tenant Patient Test Organization',
    displayName: 'Tenant Patient Test',
    status: OrganizationStatus.ACTIVE,
  };
}

function membership(userId: string, organizationId: string) {
  return {
    userId,
    organizationId,
    role: MembershipRole.PSYCHOLOGIST,
    status: 'ACTIVE' as const,
    joinedAt: new Date(),
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
