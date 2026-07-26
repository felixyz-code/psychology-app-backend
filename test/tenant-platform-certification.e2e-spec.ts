import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  AppointmentStatus,
  FinancialTransactionCategory,
  FinancialTransactionStatus,
  FinancialTransactionType,
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  PatientAssignmentRole,
  PatientAssignmentStatus,
  PaymentMethod,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { CapabilityResolverService } from '../src/tenant-context/authorization/capability-resolver.service';
import { CapabilityDecision } from '../src/tenant-context/authorization/organization-capability';

type RequestSchema = {
  properties?: Record<string, unknown>;
};

const describeCertification =
  process.env.RUN_TENANT_PLATFORM_CERTIFICATION_TESTS === 'true'
    ? describe
    : describe.skip;

describeCertification('Tenant platform certification', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let jwtService: JwtService;
  let capabilityResolver: CapabilityResolverService;
  let uploadsPath: string;

  const databaseUrl = process.env.DATABASE_URL;
  const suffix = randomUUID();

  const organizationAId = randomUUID();
  const organizationBId = randomUUID();
  const suspendedOrganizationId = randomUUID();

  const ownerAId = randomUUID();
  const psychologistAId = randomUUID();
  const psychologistA2Id = randomUUID();
  const psychologistBId = randomUUID();
  const receptionistAId = randomUUID();
  const billingAId = randomUUID();
  const suspendedMemberAId = randomUUID();
  const suspendedOrgUserId = randomUUID();

  const ownerMembershipAId = randomUUID();
  const psychologistMembershipAId = randomUUID();
  const psychologistA2MembershipId = randomUUID();
  const psychologistMembershipBId = randomUUID();
  const receptionistMembershipAId = randomUUID();
  const billingMembershipAId = randomUUID();
  const suspendedMembershipAId = randomUUID();
  const suspendedOrgMembershipId = randomUUID();

  const patientAId = randomUUID();
  const patientBId = randomUUID();
  const patientLegacyId = randomUUID();
  const patientUnassignedId = randomUUID();

  const caseFileAId = randomUUID();
  const caseFileBId = randomUUID();
  const caseFileLegacyId = randomUUID();
  const caseFileUnassignedId = randomUUID();

  const sessionNoteAId = randomUUID();
  const sessionNoteLegacyId = randomUUID();

  const documentAId = randomUUID();
  const documentBId = randomUUID();

  const appointmentAId = randomUUID();
  const appointmentBId = randomUUID();
  const appointmentLegacyId = randomUUID();

  const incomeAId = randomUUID();
  const expenseAId = randomUUID();
  const incomeBId = randomUUID();
  const incomeLegacyId = randomUUID();

  const createdTransactionIds: string[] = [];

  beforeAll(async () => {
    if (
      !databaseUrl ||
      !new URL(databaseUrl).pathname.slice(1).endsWith('_test')
    ) {
      throw new Error(
        'Tenant platform certification requires DATABASE_URL ending in _test',
      );
    }

    uploadsPath = await mkdtemp(join(tmpdir(), 'psychology-d5-uploads-'));
    process.env.DATABASE_URL = databaseUrl;
    process.env.UPLOADS_PATH = uploadsPath;
    process.env.JWT_SECRET = 'D5TenantPlatformCertificationSigningKey2026';

    prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
    await prisma.$connect();
    await seedFixture();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    jwtService = moduleRef.get(JwtService);
    capabilityResolver = moduleRef.get(CapabilityResolverService);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await rm(uploadsPath, { recursive: true, force: true });
  });

  it('certifies tenant context, suspended access denial, and patient isolation', async () => {
    const context = await request(app.getHttpServer())
      .get('/auth/context')
      .set('Authorization', bearerToken(psychologistAId))
      .expect(200);
    expect(context.body).toMatchObject({
      status: 'RESOLVED',
      tenantContext: {
        userId: psychologistAId,
        organizationId: organizationAId,
        membershipId: psychologistMembershipAId,
        organizationRole: MembershipRole.PSYCHOLOGIST,
      },
    });

    await request(app.getHttpServer())
      .get('/patients')
      .set('Authorization', bearerToken(suspendedMemberAId))
      .set('X-Organization-Id', organizationAId)
      .expect(403);
    await request(app.getHttpServer())
      .get('/patients')
      .set('Authorization', bearerToken(suspendedOrgUserId))
      .set('X-Organization-Id', suspendedOrganizationId)
      .expect(403);

    const patients = await request(app.getHttpServer())
      .get('/patients')
      .set('Authorization', bearerToken(psychologistAId))
      .expect(200);
    const visiblePatientIds = ids(patients.body);
    expect(visiblePatientIds).toEqual([patientAId]);
    expect(visiblePatientIds).not.toEqual(
      expect.arrayContaining([patientBId, patientLegacyId]),
    );

    await request(app.getHttpServer())
      .get(`/patients/${patientBId}`)
      .set('Authorization', bearerToken(psychologistAId))
      .expect(404);
    await request(app.getHttpServer())
      .get(`/patients/${patientLegacyId}`)
      .set('Authorization', bearerToken(psychologistAId))
      .expect(404);
  });

  it('certifies clinical assignment checks and legacy-null exclusion', async () => {
    await request(app.getHttpServer())
      .get(`/case-files/${caseFileAId}`)
      .set('Authorization', bearerToken(psychologistAId))
      .expect(200);
    await request(app.getHttpServer())
      .get(`/case-files/${caseFileUnassignedId}`)
      .set('Authorization', bearerToken(psychologistAId))
      .expect(403);
    await request(app.getHttpServer())
      .get(`/case-files/${caseFileBId}`)
      .set('Authorization', bearerToken(psychologistAId))
      .expect(404);

    const notes = await request(app.getHttpServer())
      .get('/session-notes')
      .set('Authorization', bearerToken(psychologistAId))
      .expect(200);
    expect(ids(notes.body)).toEqual([sessionNoteAId]);
    await request(app.getHttpServer())
      .get(`/session-notes/${sessionNoteLegacyId}`)
      .set('Authorization', bearerToken(psychologistAId))
      .expect(404);
    await request(app.getHttpServer())
      .get(`/case-files/${caseFileLegacyId}`)
      .set('Authorization', bearerToken(psychologistAId))
      .expect(404);
  });

  it('certifies role boundaries for reception and billing surfaces', async () => {
    const receptionistToken = bearerToken(receptionistAId);
    const appointment = await request(app.getHttpServer())
      .get(`/appointments/${appointmentAId}`)
      .set('Authorization', receptionistToken)
      .expect(200);
    expect(appointment.body).toMatchObject({ id: appointmentAId });
    expect(appointment.body).not.toHaveProperty('notes');

    await request(app.getHttpServer())
      .patch(`/appointments/${appointmentAId}`)
      .set('Authorization', receptionistToken)
      .send({ notes: null })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/appointments/${appointmentAId}`)
      .set('Authorization', receptionistToken)
      .send({ status: AppointmentStatus.CANCELLED })
      .expect(200);
    expect(
      await prisma.appointment.findUniqueOrThrow({
        where: { id: appointmentAId },
      }),
    ).toMatchObject({
      status: AppointmentStatus.CANCELLED,
      notes: 'D5 appointment note',
    });

    await request(app.getHttpServer())
      .get('/case-files')
      .set('Authorization', bearerToken(billingAId))
      .expect(403);
  });

  it('certifies blob isolation, server-owned finance fields, and tenant-scoped summaries', async () => {
    await request(app.getHttpServer())
      .get(`/documents/${documentBId}/download`)
      .set('Authorization', bearerToken(psychologistAId))
      .expect(404);
    await request(app.getHttpServer())
      .get(`/documents/${documentAId}/download`)
      .set('Authorization', bearerToken(psychologistAId))
      .expect(200)
      .expect('Content-Type', /application\/pdf/);

    const created = await request(app.getHttpServer())
      .post('/financial-transactions')
      .set('Authorization', bearerToken(billingAId))
      .send({
        organizationId: organizationBId,
        createdById: psychologistBId,
        type: FinancialTransactionType.INCOME,
        category: FinancialTransactionCategory.SESSION,
        paymentMethod: PaymentMethod.TRANSFER,
        amount: 30,
        concept: 'D5 server-owned transaction',
        occurredAt: '2026-05-01T10:00:00.000Z',
        patientId: patientAId,
        appointmentId: appointmentAId,
      })
      .expect(201);
    const createdId = id(created.body);
    createdTransactionIds.push(createdId);

    expect(
      await prisma.financialTransaction.findUniqueOrThrow({
        where: { id: createdId },
      }),
    ).toMatchObject({
      organizationId: organizationAId,
      createdById: billingAId,
    });

    const summary = await request(app.getHttpServer())
      .get('/financial-transactions/summary')
      .set('Authorization', bearerToken(billingAId))
      .expect(200);
    expect(summary.body).toMatchObject({
      incomeTotal: 150,
      expenseTotal: 40,
      adjustmentTotal: 0,
      refundTotal: 0,
      netTotal: 110,
      transactionCount: 3,
    });

    const crossTenantSummary = await request(app.getHttpServer())
      .get(`/financial-transactions/summary?patientId=${patientBId}`)
      .set('Authorization', bearerToken(billingAId))
      .expect(200);
    expect(crossTenantSummary.body).toMatchObject({
      incomeTotal: 0,
      expenseTotal: 0,
      netTotal: 0,
      transactionCount: 0,
    });

    const createdByForeign = await request(app.getHttpServer())
      .get(`/financial-transactions/summary?createdById=${psychologistBId}`)
      .set('Authorization', bearerToken(billingAId))
      .expect(200);
    expect(createdByForeign.body).toMatchObject({
      incomeTotal: 0,
      expenseTotal: 0,
      netTotal: 0,
      transactionCount: 0,
    });
  });

  it('certifies default-deny capabilities and representative OpenAPI server-owned contracts', () => {
    expect(
      capabilityResolver.resolve(MembershipRole.OWNER, 'future.capability'),
    ).toBe(CapabilityDecision.DENY);

    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Psychology App API')
        .setDescription('REST API documentation for the Psychology App backend')
        .setVersion('1.0.0')
        .addBearerAuth(
          {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Paste the JWT access token here',
          },
          'bearer',
        )
        .build(),
    );

    const financialCreate = getRequestSchema(
      document,
      '/financial-transactions',
      'post',
    );
    expect(Object.keys(financialCreate.properties ?? {})).toEqual(
      expect.arrayContaining(['amount', 'concept', 'occurredAt', 'type']),
    );
    expect(financialCreate.properties).not.toHaveProperty('organizationId');
    expect(financialCreate.properties).not.toHaveProperty('createdById');

    const patientCreate = getRequestSchema(document, '/patients', 'post');
    expect(Object.keys(patientCreate.properties ?? {})).toEqual(
      expect.arrayContaining(['firstName', 'lastName']),
    );
    expect(patientCreate.properties).not.toHaveProperty('organizationId');
  });

  async function seedFixture() {
    await prisma.user.createMany({
      data: [
        user(ownerAId, `d5-owner-a-${suffix}@example.test`),
        user(psychologistAId, `d5-psychologist-a-${suffix}@example.test`),
        user(psychologistA2Id, `d5-psychologist-a2-${suffix}@example.test`),
        user(psychologistBId, `d5-psychologist-b-${suffix}@example.test`),
        user(receptionistAId, `d5-receptionist-a-${suffix}@example.test`),
        user(billingAId, `d5-billing-a-${suffix}@example.test`),
        user(suspendedMemberAId, `d5-suspended-a-${suffix}@example.test`),
        user(suspendedOrgUserId, `d5-suspended-org-${suffix}@example.test`),
      ],
    });
    await prisma.organization.createMany({
      data: [
        organization(organizationAId, `d5-a-${suffix}`),
        organization(organizationBId, `d5-b-${suffix}`),
        organization(
          suspendedOrganizationId,
          `d5-suspended-${suffix}`,
          OrganizationStatus.SUSPENDED,
        ),
      ],
    });
    await prisma.organizationMembership.createMany({
      data: [
        membership(
          ownerMembershipAId,
          ownerAId,
          organizationAId,
          MembershipRole.OWNER,
        ),
        membership(psychologistMembershipAId, psychologistAId, organizationAId),
        membership(
          psychologistA2MembershipId,
          psychologistA2Id,
          organizationAId,
        ),
        membership(psychologistMembershipBId, psychologistBId, organizationBId),
        membership(
          receptionistMembershipAId,
          receptionistAId,
          organizationAId,
          MembershipRole.RECEPTIONIST,
        ),
        membership(
          billingMembershipAId,
          billingAId,
          organizationAId,
          MembershipRole.BILLING,
        ),
        membership(
          suspendedMembershipAId,
          suspendedMemberAId,
          organizationAId,
          MembershipRole.PSYCHOLOGIST,
          MembershipStatus.SUSPENDED,
        ),
        membership(
          suspendedOrgMembershipId,
          suspendedOrgUserId,
          suspendedOrganizationId,
        ),
      ],
    });
    await prisma.patient.createMany({
      data: [
        patient(patientAId, organizationAId, psychologistAId, 'A'),
        patient(patientBId, organizationBId, psychologistBId, 'B'),
        patient(patientLegacyId, null, psychologistAId, 'Legacy'),
        patient(
          patientUnassignedId,
          organizationAId,
          psychologistAId,
          'NoAssign',
        ),
      ],
    });
    await prisma.patientAssignment.createMany({
      data: [
        assignment(organizationAId, patientAId, psychologistMembershipAId),
        assignment(organizationBId, patientBId, psychologistMembershipBId),
        assignment(organizationAId, patientLegacyId, psychologistMembershipAId),
      ],
    });
    await prisma.caseFile.createMany({
      data: [
        caseFile(caseFileAId, organizationAId, patientAId),
        caseFile(caseFileBId, organizationBId, patientBId),
        caseFile(caseFileLegacyId, null, patientLegacyId),
        caseFile(caseFileUnassignedId, organizationAId, patientUnassignedId),
      ],
    });
    await prisma.sessionNote.createMany({
      data: [
        sessionNote(
          sessionNoteAId,
          organizationAId,
          caseFileAId,
          psychologistAId,
        ),
        sessionNote(
          sessionNoteLegacyId,
          null,
          caseFileLegacyId,
          psychologistAId,
        ),
      ],
    });
    await mkdir(join(uploadsPath, 'patients', patientAId), { recursive: true });
    await mkdir(join(uploadsPath, 'patients', patientBId), { recursive: true });
    await writeFile(blobPath(patientAId, 'document-a.pdf'), '%PDF-1.7\nD5A');
    await writeFile(blobPath(patientBId, 'document-b.pdf'), '%PDF-1.7\nD5B');
    await prisma.document.createMany({
      data: [
        document(
          documentAId,
          organizationAId,
          caseFileAId,
          patientAId,
          'document-a.pdf',
        ),
        document(
          documentBId,
          organizationBId,
          caseFileBId,
          patientBId,
          'document-b.pdf',
        ),
      ],
    });
    await prisma.appointment.createMany({
      data: [
        appointment(
          appointmentAId,
          organizationAId,
          patientAId,
          psychologistAId,
          'D5 appointment note',
          '2026-04-01T10:00:00.000Z',
        ),
        appointment(
          appointmentBId,
          organizationBId,
          patientBId,
          psychologistBId,
          'D5 foreign appointment note',
          '2026-04-01T11:00:00.000Z',
        ),
        appointment(
          appointmentLegacyId,
          null,
          patientLegacyId,
          psychologistAId,
          'D5 legacy appointment note',
          '2026-04-01T12:00:00.000Z',
        ),
      ],
    });
    await prisma.financialTransaction.createMany({
      data: [
        transaction({
          id: incomeAId,
          organizationId: organizationAId,
          type: FinancialTransactionType.INCOME,
          amount: 120,
          concept: 'D5 tenant A income',
          createdById: billingAId,
          patientId: patientAId,
          appointmentId: appointmentAId,
          category: FinancialTransactionCategory.SESSION,
          paymentMethod: PaymentMethod.TRANSFER,
          occurredAt: '2026-04-01T10:00:00.000Z',
        }),
        transaction({
          id: expenseAId,
          organizationId: organizationAId,
          type: FinancialTransactionType.EXPENSE,
          amount: 40,
          concept: 'D5 tenant A expense',
          createdById: billingAId,
          category: FinancialTransactionCategory.RENT,
          paymentMethod: PaymentMethod.CASH,
          occurredAt: '2026-04-02T10:00:00.000Z',
        }),
        transaction({
          id: incomeBId,
          organizationId: organizationBId,
          type: FinancialTransactionType.INCOME,
          amount: 999,
          concept: 'D5 tenant B income',
          createdById: psychologistBId,
          patientId: patientBId,
          appointmentId: appointmentBId,
          category: FinancialTransactionCategory.SESSION,
          paymentMethod: PaymentMethod.TRANSFER,
          occurredAt: '2026-04-01T10:00:00.000Z',
        }),
        transaction({
          id: incomeLegacyId,
          organizationId: null,
          type: FinancialTransactionType.INCOME,
          amount: 500,
          concept: 'D5 legacy income',
          createdById: billingAId,
          patientId: patientLegacyId,
          appointmentId: appointmentLegacyId,
          occurredAt: '2026-04-01T10:00:00.000Z',
        }),
      ],
    });
  }

  function bearerToken(userId: string) {
    return `Bearer ${jwtService.sign({
      sub: userId,
      name: 'Tenant Platform Certification User',
      email: 'tenant-platform-certification@example.test',
      role: UserRole.PSYCHOLOGIST,
    })}`;
  }

  function blobPath(patientId: string, fileName: string) {
    return join(uploadsPath, 'patients', patientId, fileName);
  }

  function document(
    id: string,
    organizationId: string | null,
    caseFileId: string,
    patientId: string,
    fileName: string,
  ) {
    return {
      id,
      organizationId,
      caseFileId,
      uploadedById: psychologistAId,
      fileName,
      filePath: relative(uploadsPath, blobPath(patientId, fileName)),
      mimeType: 'application/pdf',
    };
  }
});

function getRequestSchema(
  document: OpenAPIObject,
  path: string,
  method: 'post',
): RequestSchema {
  const operation = document.paths[path]?.[method];
  const requestBody = operation?.requestBody;
  if (!requestBody || '$ref' in requestBody) {
    throw new Error(
      `Expected request body for ${method.toUpperCase()} ${path}`,
    );
  }
  const schema = requestBody.content['application/json']?.schema;
  if (!schema) {
    throw new Error(
      `Expected JSON request schema for ${method.toUpperCase()} ${path}`,
    );
  }

  return resolveSchema(document, schema);
}

function resolveSchema(
  document: OpenAPIObject,
  schema: unknown,
): RequestSchema {
  if (isReferenceObject(schema)) {
    const schemaName = schema.$ref.replace('#/components/schemas/', '');
    const resolved = document.components?.schemas?.[schemaName];
    if (!resolved) {
      throw new Error(`Expected OpenAPI schema ${schemaName}`);
    }

    return resolved as RequestSchema;
  }

  return schema as RequestSchema;
}

function isReferenceObject(value: unknown): value is { $ref: string } {
  return isRecord(value) && typeof value.$ref === 'string';
}

function user(id: string, email: string) {
  return {
    id,
    name: 'Tenant Platform Certification User',
    email,
    passwordHash: 'not-a-real-password',
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
    legalName: 'Tenant Platform Certification Organization',
    displayName: 'Tenant Platform Certification',
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

function caseFile(
  id: string,
  organizationId: string | null,
  patientId: string,
) {
  return {
    id,
    organizationId,
    patientId,
    diagnosis: 'D5 diagnosis',
    treatmentPlan: 'D5 plan',
  };
}

function sessionNote(
  id: string,
  organizationId: string | null,
  caseFileId: string,
  authorId: string,
) {
  return {
    id,
    organizationId,
    caseFileId,
    authorId,
    sessionDate: new Date('2026-04-01T10:00:00.000Z'),
    title: 'D5 seed note',
    content: 'D5 seed content',
  };
}

function appointment(
  id: string,
  organizationId: string | null,
  patientId: string,
  psychologistId: string,
  notes: string,
  scheduledAt: string,
) {
  return {
    id,
    organizationId,
    patientId,
    psychologistId,
    scheduledAt: new Date(scheduledAt),
    durationMinutes: 50,
    status: AppointmentStatus.SCHEDULED,
    notes,
  };
}

function transaction(data: {
  id: string;
  organizationId: string | null;
  type: FinancialTransactionType;
  amount: number;
  concept: string;
  createdById: string;
  occurredAt: string;
  category?: FinancialTransactionCategory;
  paymentMethod?: PaymentMethod;
  patientId?: string;
  appointmentId?: string;
}) {
  return {
    id: data.id,
    organizationId: data.organizationId,
    type: data.type,
    status: FinancialTransactionStatus.COMPLETED,
    amount: data.amount,
    concept: data.concept,
    occurredAt: new Date(data.occurredAt),
    createdById: data.createdById,
    category: data.category,
    paymentMethod: data.paymentMethod,
    patientId: data.patientId,
    appointmentId: data.appointmentId,
  };
}

function ids(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error('Expected an array response');
  }

  return value.map(id);
}

function id(value: unknown): string {
  if (!isRecord(value) || typeof value.id !== 'string') {
    throw new Error('Expected response with id');
  }

  return value.id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
