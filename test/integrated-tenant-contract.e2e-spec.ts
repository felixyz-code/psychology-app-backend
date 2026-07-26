import { INestApplication, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
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
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

const describeCertification =
  process.env.RUN_INTEGRATED_TENANT_CONTRACT_TESTS === 'true'
    ? describe
    : describe.skip;

describeCertification('Integrated tenant contract HTTP certification', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let jwtService: JwtService;
  let uploadsPath: string;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  const databaseUrl = process.env.DATABASE_URL;
  const suffix = randomUUID();
  const password = 'IntegratedTenantContractTest1!';

  const organizationAId = randomUUID();
  const organizationBId = randomUUID();
  const suspendedOrganizationId = randomUUID();

  const ownerAId = randomUUID();
  const adminAId = randomUUID();
  const psychologistAId = randomUUID();
  const psychologistA2Id = randomUUID();
  const psychologistBId = randomUUID();
  const receptionistAId = randomUUID();
  const billingAId = randomUUID();
  const auditorAId = randomUUID();
  const readOnlyAId = randomUUID();
  const suspendedMemberAId = randomUUID();
  const suspendedOrgUserId = randomUUID();
  const noMembershipUserId = randomUUID();
  const multiMemberUserId = randomUUID();

  const ownerMembershipAId = randomUUID();
  const adminMembershipAId = randomUUID();
  const psychologistMembershipAId = randomUUID();
  const psychologistA2MembershipId = randomUUID();
  const psychologistMembershipBId = randomUUID();
  const receptionistMembershipAId = randomUUID();
  const billingMembershipAId = randomUUID();
  const auditorMembershipAId = randomUUID();
  const readOnlyMembershipAId = randomUUID();
  const suspendedMembershipAId = randomUUID();
  const suspendedOrgMembershipId = randomUUID();
  const multiMembershipAId = randomUUID();
  const multiMembershipBId = randomUUID();

  const patientAId = randomUUID();
  const patientBId = randomUUID();
  const patientLegacyId = randomUUID();
  const patientUnassignedId = randomUUID();
  const patientInactiveAssignmentId = randomUUID();
  const patientWrongTenantAssignmentId = randomUUID();
  const patientMultiAId = randomUUID();
  const patientMultiBId = randomUUID();

  const caseFileAId = randomUUID();
  const caseFileBId = randomUUID();
  const caseFileLegacyId = randomUUID();
  const caseFileUnassignedId = randomUUID();
  const caseFileInactiveAssignmentId = randomUUID();
  const caseFileWrongTenantAssignmentId = randomUUID();

  const sessionNoteAId = randomUUID();
  const sessionNoteBId = randomUUID();
  const sessionNoteLegacyId = randomUUID();

  const documentAId = randomUUID();
  const documentBId = randomUUID();
  const documentLegacyId = randomUUID();
  const documentMissingBlobId = randomUUID();
  const orphanBlobFileName = 'orphan.pdf';

  const appointmentAId = randomUUID();
  const appointmentBId = randomUUID();
  const appointmentLegacyId = randomUUID();
  const appointmentMismatchAId = randomUUID();

  const incomeAId = randomUUID();
  const expenseAId = randomUUID();
  const incomeBId = randomUUID();
  const incomeLegacyId = randomUUID();

  const createdPatientIds: string[] = [];
  const createdCaseFileIds: string[] = [];
  const createdSessionNoteIds: string[] = [];
  const createdDocumentIds: string[] = [];
  const createdAppointmentIds: string[] = [];
  const createdTransactionIds: string[] = [];

  beforeAll(async () => {
    if (
      !databaseUrl ||
      !new URL(databaseUrl).pathname.slice(1).endsWith('_test')
    ) {
      throw new Error(
        'Integrated tenant certification requires DATABASE_URL ending in _test',
      );
    }

    uploadsPath = await mkdtemp(join(tmpdir(), 'psychology-d4-uploads-'));
    process.env.DATABASE_URL = databaseUrl;
    process.env.UPLOADS_PATH = uploadsPath;
    process.env.JWT_SECRET = 'Qx7Za9Lp4Vm2Kr8Nj5Hs6Dt3Bw1Cy0Fu7Eg9Ra2';
    warnSpy = jest.spyOn(Logger.prototype, 'warn');
    errorSpy = jest.spyOn(Logger.prototype, 'error');

    prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
    await prisma.$connect();
    await seedFixture();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    jwtService = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    await rm(uploadsPath, { recursive: true, force: true });
    warnSpy?.mockRestore();
    errorSpy?.mockRestore();
  });

  it('lets a freelancer OWNER cross the full tenant-aware clinical and financial flow', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: `d4-owner-a-${suffix}@example.test`, password })
      .expect(201);
    const ownerToken = `Bearer ${accessToken(login.body)}`;

    const patient = await request(app.getHttpServer())
      .post('/patients')
      .set('Authorization', ownerToken)
      .send({
        firstName: 'D4',
        lastName: 'Freelancer',
        organizationId: organizationBId,
        psychologistId: psychologistBId,
      })
      .expect(201);
    const createdPatientId = id(patient.body);
    createdPatientIds.push(createdPatientId);

    const persistedPatient = await prisma.patient.findUniqueOrThrow({
      where: { id: createdPatientId },
    });
    expect(persistedPatient).toMatchObject({
      organizationId: organizationAId,
      psychologistId: ownerAId,
    });
    await prisma.patientAssignment.findFirstOrThrow({
      where: {
        patientId: createdPatientId,
        organizationId: organizationAId,
        membershipId: ownerMembershipAId,
        status: PatientAssignmentStatus.ACTIVE,
      },
    });

    const caseFile = await request(app.getHttpServer())
      .post('/case-files')
      .set('Authorization', ownerToken)
      .send({
        patientId: createdPatientId,
        diagnosis: 'Integrated diagnosis',
        treatmentPlan: 'Integrated treatment plan',
      })
      .expect(201);
    const createdCaseFileId = id(caseFile.body);
    createdCaseFileIds.push(createdCaseFileId);

    const note = await request(app.getHttpServer())
      .post('/session-notes')
      .set('Authorization', ownerToken)
      .send({
        caseFileId: createdCaseFileId,
        organizationId: organizationBId,
        authorId: psychologistBId,
        title: 'Integrated session',
        content: 'Integrated clinical content',
        sessionDate: '2026-03-01T10:00:00.000Z',
      })
      .expect(201);
    const createdNoteId = id(note.body);
    createdSessionNoteIds.push(createdNoteId);
    await expectServerOwnedSessionNote(createdNoteId, ownerAId);

    const uploaded = await request(app.getHttpServer())
      .post('/documents/upload')
      .set('Authorization', ownerToken)
      .field('caseFileId', createdCaseFileId)
      .attach('file', Buffer.from('%PDF-1.7\n%d4'), {
        filename: 'd4-upload.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    const createdDocumentId = id(uploaded.body);
    createdDocumentIds.push(createdDocumentId);
    const persistedDocument = await prisma.document.findUniqueOrThrow({
      where: { id: createdDocumentId },
    });
    expect(persistedDocument).toMatchObject({
      organizationId: organizationAId,
      uploadedById: ownerAId,
    });

    const appointment = await request(app.getHttpServer())
      .post('/appointments')
      .set('Authorization', ownerToken)
      .send({
        organizationId: organizationBId,
        patientId: createdPatientId,
        psychologistId: ownerAId,
        scheduledAt: '2026-03-02T10:00:00.000Z',
        durationMinutes: 50,
        notes: 'Integrated appointment note',
      })
      .expect(201);
    const createdAppointmentId = id(appointment.body);
    createdAppointmentIds.push(createdAppointmentId);
    expect(appointment.body).toMatchObject({
      id: createdAppointmentId,
      notes: 'Integrated appointment note',
    });

    const transaction = await request(app.getHttpServer())
      .post('/financial-transactions')
      .set('Authorization', ownerToken)
      .send({
        organizationId: organizationBId,
        createdById: billingAId,
        type: FinancialTransactionType.INCOME,
        status: FinancialTransactionStatus.COMPLETED,
        category: FinancialTransactionCategory.SESSION,
        paymentMethod: PaymentMethod.TRANSFER,
        amount: 80,
        concept: 'Integrated tenant income',
        occurredAt: '2026-03-02T11:00:00.000Z',
        patientId: createdPatientId,
        appointmentId: createdAppointmentId,
      })
      .expect(201);
    const createdTransactionId = id(transaction.body);
    createdTransactionIds.push(createdTransactionId);
    const persistedTransaction =
      await prisma.financialTransaction.findUniqueOrThrow({
        where: { id: createdTransactionId },
      });
    expect(persistedTransaction).toMatchObject({
      organizationId: organizationAId,
      createdById: ownerAId,
      patientId: createdPatientId,
      appointmentId: createdAppointmentId,
    });

    const workspace = await request(app.getHttpServer())
      .get(`/case-files/${createdCaseFileId}/workspace`)
      .set('Authorization', ownerToken)
      .expect(200);
    const workspaceBody = record(workspace.body);
    expect(ids(workspaceBody.sessionNotes)).toEqual([createdNoteId]);
    expect(ids(workspaceBody.documents)).toEqual([createdDocumentId]);
    expect(ids(workspaceBody.appointments)).toEqual([createdAppointmentId]);

    const summary = await request(app.getHttpServer())
      .get('/financial-transactions/summary?from=2026-03-01')
      .set('Authorization', ownerToken)
      .expect(200);
    expect(summary.body).toMatchObject({
      incomeTotal: 80,
      expenseTotal: 0,
      adjustmentTotal: 0,
      refundTotal: 0,
      netTotal: 80,
      transactionCount: 1,
    });
  });

  it('keeps role boundaries integrated across clinical, operational, and finance surfaces', async () => {
    const receptionistToken = bearerToken(receptionistAId);
    const billingToken = bearerToken(billingAId);
    const psychologistToken = bearerToken(psychologistAId);

    const receptionistAppointment = await request(app.getHttpServer())
      .get(`/appointments/${appointmentAId}`)
      .set('Authorization', receptionistToken)
      .expect(200);
    expect(receptionistAppointment.body).not.toHaveProperty('notes');

    await request(app.getHttpServer())
      .patch(`/appointments/${appointmentAId}`)
      .set('Authorization', receptionistToken)
      .send({ notes: null })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/appointments/${appointmentAId}`)
      .set('Authorization', receptionistToken)
      .send({ notes: '' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/appointments/${appointmentAId}`)
      .set('Authorization', receptionistToken)
      .send({ status: AppointmentStatus.CANCELLED, notes: undefined })
      .expect(200);
    const appointmentAfterReceptionist =
      await prisma.appointment.findUniqueOrThrow({
        where: { id: appointmentAId },
      });
    expect(appointmentAfterReceptionist).toMatchObject({
      status: AppointmentStatus.CANCELLED,
      notes: 'Seed appointment note',
    });

    const assignedAppointment = await request(app.getHttpServer())
      .get(`/appointments/${appointmentAId}`)
      .set('Authorization', psychologistToken)
      .expect(200);
    expect(assignedAppointment.body).toMatchObject({
      id: appointmentAId,
      notes: 'Seed appointment note',
    });

    for (const userId of [adminAId, ownerAId]) {
      const response = await request(app.getHttpServer())
        .get(`/appointments/${appointmentAId}`)
        .set('Authorization', bearerToken(userId))
        .expect(200);
      expect(response.body).not.toHaveProperty('notes');
    }

    await request(app.getHttpServer())
      .get('/case-files')
      .set('Authorization', billingToken)
      .expect(403);
    await request(app.getHttpServer())
      .get('/documents')
      .set('Authorization', billingToken)
      .expect(403);

    const financeList = await request(app.getHttpServer())
      .get('/financial-transactions')
      .set('Authorization', billingToken)
      .expect(200);
    expect(ids(financeList.body)).toEqual(
      expect.arrayContaining([incomeAId, expenseAId]),
    );
    expect(ids(financeList.body)).not.toEqual(
      expect.arrayContaining([incomeBId]),
    );

    await request(app.getHttpServer())
      .get('/financial-transactions')
      .set('Authorization', receptionistToken)
      .expect(403);
    await request(app.getHttpServer())
      .get('/financial-transactions/summary')
      .set('Authorization', psychologistToken)
      .expect(403);

    for (const userId of [auditorAId, readOnlyAId]) {
      const token = bearerToken(userId);
      await request(app.getHttpServer())
        .get('/case-files')
        .set('Authorization', token)
        .expect(403);
      const blobDenied = await request(app.getHttpServer())
        .get(`/documents/${documentAId}/download`)
        .set('Authorization', token);
      expect([403, 404]).toContain(blobDenied.status);
      await request(app.getHttpServer())
        .get('/financial-transactions/summary')
        .set('Authorization', token)
        .expect(403);
    }
  });

  it('isolates cross-tenant and legacy-null resources across every converted surface', async () => {
    const psychologistToken = bearerToken(psychologistAId);
    const billingToken = bearerToken(billingAId);

    await expectListIncludes(
      '/patients',
      psychologistToken,
      [patientAId],
      [patientBId, patientLegacyId],
    );
    await expectListIncludes(
      '/case-files',
      psychologistToken,
      [caseFileAId],
      [caseFileBId, caseFileLegacyId],
    );
    await expectListIncludes(
      '/session-notes',
      psychologistToken,
      [sessionNoteAId],
      [sessionNoteBId, sessionNoteLegacyId],
    );
    await expectListIncludes(
      '/documents',
      psychologistToken,
      [documentAId, documentMissingBlobId],
      [documentBId, documentLegacyId],
    );
    await expectListIncludes(
      '/appointments',
      psychologistToken,
      [appointmentAId],
      [appointmentBId, appointmentLegacyId],
    );
    await expectListIncludes(
      '/financial-transactions',
      billingToken,
      [incomeAId, expenseAId],
      [incomeBId, incomeLegacyId],
    );

    await request(app.getHttpServer())
      .get(`/patients/${patientBId}`)
      .set('Authorization', psychologistToken)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/patients/${patientLegacyId}`)
      .set('Authorization', psychologistToken)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/case-files/${caseFileBId}`)
      .set('Authorization', psychologistToken)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/case-files/${caseFileLegacyId}`)
      .set('Authorization', psychologistToken)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/session-notes/${sessionNoteBId}`)
      .set('Authorization', psychologistToken)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/session-notes/${sessionNoteLegacyId}`)
      .set('Authorization', psychologistToken)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/documents/${documentBId}`)
      .set('Authorization', psychologistToken)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/documents/${documentLegacyId}`)
      .set('Authorization', psychologistToken)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/appointments/${appointmentBId}`)
      .set('Authorization', psychologistToken)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/appointments/${appointmentLegacyId}`)
      .set('Authorization', psychologistToken)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/financial-transactions/${incomeBId}`)
      .set('Authorization', billingToken)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/financial-transactions/${incomeLegacyId}`)
      .set('Authorization', billingToken)
      .expect(404);

    const beforeCaseFile = await prisma.caseFile.findUniqueOrThrow({
      where: { id: caseFileBId },
    });
    await request(app.getHttpServer())
      .patch(`/case-files/${caseFileBId}`)
      .set('Authorization', psychologistToken)
      .send({ diagnosis: 'Blocked' })
      .expect(404);
    expect(
      await prisma.caseFile.findUniqueOrThrow({ where: { id: caseFileBId } }),
    ).toMatchObject({ diagnosis: beforeCaseFile.diagnosis });

    const beforeTransaction =
      await prisma.financialTransaction.findUniqueOrThrow({
        where: { id: incomeBId },
      });
    await request(app.getHttpServer())
      .delete(`/financial-transactions/${incomeBId}`)
      .set('Authorization', billingToken)
      .expect(404);
    expect(
      await prisma.financialTransaction.findUniqueOrThrow({
        where: { id: incomeBId },
      }),
    ).toMatchObject({ concept: beforeTransaction.concept });

    const summary = await request(app.getHttpServer())
      .get('/financial-transactions/summary')
      .set('Authorization', billingToken)
      .expect(200);
    expect(summary.body).toMatchObject({
      incomeTotal: 200,
      expenseTotal: 40,
      netTotal: 160,
      transactionCount: 3,
    });
  });

  it('enforces tenant context, selection, assignment, and relation contracts', async () => {
    await request(app.getHttpServer()).get('/patients').expect(401);
    await request(app.getHttpServer())
      .get('/patients')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
    await request(app.getHttpServer())
      .get('/patients')
      .set('Authorization', bearerToken(psychologistAId))
      .set('X-Organization-Id', 'not-a-uuid')
      .expect(400);
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
    await request(app.getHttpServer())
      .get('/patients')
      .set('Authorization', bearerToken(noMembershipUserId))
      .expect(403);

    const multiToken = bearerToken(multiMemberUserId);
    await request(app.getHttpServer())
      .get('/patients')
      .set('Authorization', multiToken)
      .expect(409);
    await expectList('/patients', multiToken, [patientMultiAId], {
      'X-Organization-Id': organizationAId,
    });
    await expectList('/patients', multiToken, [patientMultiBId], {
      'X-Organization-Id': organizationBId,
    });

    await request(app.getHttpServer())
      .get(`/case-files/${caseFileUnassignedId}`)
      .set('Authorization', bearerToken(psychologistAId))
      .expect(403);
    await request(app.getHttpServer())
      .get(`/case-files/${caseFileWrongTenantAssignmentId}`)
      .set('Authorization', bearerToken(psychologistAId))
      .expect(403);

    await request(app.getHttpServer())
      .post('/appointments')
      .set('Authorization', bearerToken(psychologistAId))
      .send({
        patientId: patientBId,
        psychologistId: psychologistAId,
        scheduledAt: '2026-03-03T10:00:00.000Z',
        durationMinutes: 50,
      })
      .expect(404);
    await request(app.getHttpServer())
      .post('/financial-transactions')
      .set('Authorization', bearerToken(billingAId))
      .send({
        type: FinancialTransactionType.INCOME,
        amount: 10,
        concept: 'Visible incompatible relation',
        occurredAt: '2026-03-03T10:00:00.000Z',
        patientId: patientAId,
        appointmentId: appointmentMismatchAId,
      })
      .expect(400);
  });

  it('guards document blob access, storage key mutation, and sanitized observability', async () => {
    const token = bearerToken(psychologistAId);

    await request(app.getHttpServer())
      .get(`/documents/${documentBId}/download`)
      .set('Authorization', token)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/documents/${documentMissingBlobId}/download`)
      .set('Authorization', token)
      .expect(404);

    for (const filePath of [
      '../outside.pdf',
      `patients/${patientAId}/%2e%2e/outside.pdf`,
      join(uploadsPath, 'patients', patientAId, 'absolute.pdf'),
      `patients/${patientAId}/bad\u0000.pdf`,
    ]) {
      await request(app.getHttpServer())
        .patch(`/documents/${documentAId}`)
        .set('Authorization', token)
        .send({ filePath })
        .expect(400);
    }

    await request(app.getHttpServer())
      .get(`/documents/${documentAId}/download`)
      .set('Authorization', token)
      .expect(200)
      .expect('Content-Type', /application\/pdf/);

    const logArguments: unknown[] = [
      ...(warnSpy.mock.calls.flat() as unknown[]),
      ...(errorSpy.mock.calls.flat() as unknown[]),
    ];
    const logs = logArguments.map(String);
    const serializedLogs = logs.join('\n');
    expect(serializedLogs).not.toContain('Seed appointment note');
    expect(serializedLogs).not.toContain('Integrated clinical content');
    expect(serializedLogs).not.toContain('d4-upload.pdf');
    expect(serializedLogs).not.toContain('Bearer ');
    expect(serializedLogs).not.toContain('Authorization');
    expect(serializedLogs).not.toContain(password);
    expect(serializedLogs).not.toContain(databaseUrl ?? 'DATABASE_URL');
    expect(serializedLogs).not.toContain('SELECT ');
    expect(serializedLogs).not.toContain(uploadsPath);
    expect(serializedLogs).toContain('tenant_selection_denied');
    expect(serializedLogs).toContain('capability_denied');
  });

  it('keeps financial summary filters tenant-scoped and createdById server-owned', async () => {
    const billingToken = bearerToken(billingAId);

    const created = await request(app.getHttpServer())
      .post('/financial-transactions')
      .set('Authorization', billingToken)
      .send({
        organizationId: organizationBId,
        createdById: psychologistBId,
        type: FinancialTransactionType.INCOME,
        category: FinancialTransactionCategory.SESSION,
        paymentMethod: PaymentMethod.TRANSFER,
        amount: 30,
        concept: 'Server-owned creator',
        occurredAt: '2026-02-15T10:00:00.000Z',
        patientId: patientAId,
        appointmentId: appointmentAId,
      })
      .expect(201);
    const createdId = id(created.body);
    createdTransactionIds.push(createdId);
    const persisted = await prisma.financialTransaction.findUniqueOrThrow({
      where: { id: createdId },
    });
    expect(persisted).toMatchObject({
      organizationId: organizationAId,
      createdById: billingAId,
    });

    await request(app.getHttpServer())
      .patch(`/financial-transactions/${createdId}`)
      .set('Authorization', billingToken)
      .send({ createdById: psychologistBId, concept: 'Updated creator test' })
      .expect(200);
    expect(
      await prisma.financialTransaction.findUniqueOrThrow({
        where: { id: createdId },
      }),
    ).toMatchObject({
      createdById: billingAId,
      concept: 'Updated creator test',
    });

    await expectSummary('/financial-transactions/summary', {
      incomeTotal: 230,
      expenseTotal: 40,
      netTotal: 190,
      transactionCount: 4,
    });
    await expectSummary('/financial-transactions/summary?from=2026-02-01', {
      incomeTotal: 110,
      expenseTotal: 0,
      netTotal: 110,
      transactionCount: 2,
    });
    await expectSummary(
      `/financial-transactions/summary?category=${FinancialTransactionCategory.SESSION}`,
      {
        incomeTotal: 230,
        expenseTotal: 0,
        netTotal: 230,
        transactionCount: 3,
      },
    );
    await expectSummary(
      `/financial-transactions/summary?paymentMethod=${PaymentMethod.CASH}`,
      {
        incomeTotal: 0,
        expenseTotal: 40,
        netTotal: -40,
        transactionCount: 1,
      },
    );
    await expectSummary(
      `/financial-transactions/summary?patientId=${patientAId}`,
      {
        incomeTotal: 150,
        expenseTotal: 0,
        netTotal: 150,
        transactionCount: 2,
      },
    );
    await expectSummary(
      `/financial-transactions/summary?appointmentId=${appointmentAId}`,
      {
        incomeTotal: 150,
        expenseTotal: 0,
        netTotal: 150,
        transactionCount: 2,
      },
    );
    await expectSummary(
      `/financial-transactions/summary?patientId=${patientBId}`,
      {
        incomeTotal: 0,
        expenseTotal: 0,
        netTotal: 0,
        transactionCount: 0,
      },
    );
    await expectSummary(
      `/financial-transactions/summary?createdById=${psychologistBId}`,
      {
        incomeTotal: 0,
        expenseTotal: 0,
        netTotal: 0,
        transactionCount: 0,
      },
    );

    await request(app.getHttpServer())
      .get('/financial-transactions/summary')
      .set('Authorization', bearerToken(adminAId))
      .expect(200);
    await request(app.getHttpServer())
      .get('/financial-transactions/summary')
      .set('Authorization', bearerToken(psychologistAId))
      .expect(403);

    async function expectSummary(
      route: string,
      expected: {
        incomeTotal: number;
        expenseTotal: number;
        netTotal: number;
        transactionCount: number;
      },
    ) {
      const response = await request(app.getHttpServer())
        .get(route)
        .set('Authorization', billingToken)
        .expect(200);
      expect(response.body).toMatchObject({
        adjustmentTotal: 0,
        refundTotal: 0,
        ...expected,
      });
    }
  });

  async function expectList(
    route: string,
    token: string,
    expectedIds: string[],
    headers: Record<string, string> = {},
  ) {
    const requestBuilder = request(app.getHttpServer())
      .get(route)
      .set('Authorization', token);
    for (const [name, value] of Object.entries(headers)) {
      requestBuilder.set(name, value);
    }
    const response = await requestBuilder.expect(200);
    expect(ids(response.body).sort()).toEqual(expectedIds.sort());
  }

  async function expectListIncludes(
    route: string,
    token: string,
    expectedPresent: string[],
    expectedAbsent: string[],
  ) {
    const response = await request(app.getHttpServer())
      .get(route)
      .set('Authorization', token)
      .expect(200);
    const actualIds = ids(response.body);
    expect(actualIds).toEqual(expect.arrayContaining(expectedPresent));
    expect(actualIds).not.toEqual(expect.arrayContaining(expectedAbsent));
  }

  function bearerToken(userId: string) {
    return `Bearer ${jwtService.sign({
      sub: userId,
      name: 'Integrated Tenant Test User',
      email: 'integrated-tenant@example.test',
      role: UserRole.PSYCHOLOGIST,
    })}`;
  }

  async function expectServerOwnedSessionNote(id: string, authorId: string) {
    const note = await prisma.sessionNote.findUniqueOrThrow({ where: { id } });
    expect(note).toMatchObject({
      organizationId: organizationAId,
      authorId,
    });
  }

  async function seedFixture() {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.createMany({
      data: [
        user(ownerAId, `d4-owner-a-${suffix}@example.test`, passwordHash),
        user(adminAId, `d4-admin-a-${suffix}@example.test`),
        user(psychologistAId, `d4-psychologist-a-${suffix}@example.test`),
        user(psychologistA2Id, `d4-psychologist-a2-${suffix}@example.test`),
        user(psychologistBId, `d4-psychologist-b-${suffix}@example.test`),
        user(receptionistAId, `d4-receptionist-a-${suffix}@example.test`),
        user(billingAId, `d4-billing-a-${suffix}@example.test`),
        user(auditorAId, `d4-auditor-a-${suffix}@example.test`),
        user(readOnlyAId, `d4-read-only-a-${suffix}@example.test`),
        user(suspendedMemberAId, `d4-suspended-a-${suffix}@example.test`),
        user(suspendedOrgUserId, `d4-suspended-org-${suffix}@example.test`),
        user(noMembershipUserId, `d4-no-membership-${suffix}@example.test`),
        user(multiMemberUserId, `d4-multi-${suffix}@example.test`),
      ],
    });
    await prisma.organization.createMany({
      data: [
        organization(organizationAId, `d4-a-${suffix}`),
        organization(organizationBId, `d4-b-${suffix}`),
        organization(
          suspendedOrganizationId,
          `d4-suspended-${suffix}`,
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
        membership(
          adminMembershipAId,
          adminAId,
          organizationAId,
          MembershipRole.ADMIN,
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
          auditorMembershipAId,
          auditorAId,
          organizationAId,
          MembershipRole.AUDITOR,
        ),
        membership(
          readOnlyMembershipAId,
          readOnlyAId,
          organizationAId,
          MembershipRole.READ_ONLY,
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
        membership(multiMembershipAId, multiMemberUserId, organizationAId),
        membership(multiMembershipBId, multiMemberUserId, organizationBId),
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
        patient(
          patientInactiveAssignmentId,
          organizationAId,
          psychologistAId,
          'InactiveAssign',
        ),
        patient(
          patientWrongTenantAssignmentId,
          organizationAId,
          psychologistAId,
          'WrongTenantAssign',
        ),
        patient(patientMultiAId, organizationAId, multiMemberUserId, 'MultiA'),
        patient(patientMultiBId, organizationBId, multiMemberUserId, 'MultiB'),
      ],
    });
    await prisma.patientAssignment.createMany({
      data: [
        assignment(organizationAId, patientAId, psychologistMembershipAId),
        assignment(organizationBId, patientBId, psychologistMembershipBId),
        assignment(organizationAId, patientLegacyId, psychologistMembershipAId),
        assignment(
          organizationAId,
          patientInactiveAssignmentId,
          psychologistMembershipAId,
          PatientAssignmentStatus.REVOKED,
        ),
        assignment(
          organizationBId,
          patientWrongTenantAssignmentId,
          psychologistMembershipBId,
        ),
        assignment(organizationAId, patientMultiAId, multiMembershipAId),
        assignment(organizationBId, patientMultiBId, multiMembershipBId),
      ],
    });
    await prisma.caseFile.createMany({
      data: [
        caseFile(caseFileAId, organizationAId, patientAId),
        caseFile(caseFileBId, organizationBId, patientBId),
        caseFile(caseFileLegacyId, null, patientLegacyId),
        caseFile(caseFileUnassignedId, organizationAId, patientUnassignedId),
        caseFile(
          caseFileInactiveAssignmentId,
          organizationAId,
          patientInactiveAssignmentId,
        ),
        caseFile(
          caseFileWrongTenantAssignmentId,
          organizationAId,
          patientWrongTenantAssignmentId,
        ),
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
          sessionNoteBId,
          organizationBId,
          caseFileBId,
          psychologistBId,
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
    await writeFile(blobPath(patientAId, 'document-a.pdf'), '%PDF-1.7\nA');
    await writeFile(blobPath(patientBId, 'document-b.pdf'), '%PDF-1.7\nB');
    await writeFile(join(uploadsPath, orphanBlobFileName), '%PDF-1.7\nORPHAN');
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
        document(
          documentLegacyId,
          null,
          caseFileLegacyId,
          patientLegacyId,
          'legacy.pdf',
        ),
        document(
          documentMissingBlobId,
          organizationAId,
          caseFileAId,
          patientAId,
          'missing.pdf',
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
          'Seed appointment note',
          '2026-02-01T10:00:00.000Z',
        ),
        appointment(
          appointmentBId,
          organizationBId,
          patientBId,
          psychologistBId,
          'Foreign appointment note',
          '2026-02-01T11:00:00.000Z',
        ),
        appointment(
          appointmentLegacyId,
          null,
          patientLegacyId,
          psychologistAId,
          'Legacy appointment note',
          '2026-02-01T12:00:00.000Z',
        ),
        appointment(
          appointmentMismatchAId,
          organizationAId,
          patientUnassignedId,
          psychologistAId,
          'Mismatch appointment note',
          '2026-02-01T13:00:00.000Z',
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
          concept: 'Tenant A income',
          createdById: billingAId,
          patientId: patientAId,
          appointmentId: appointmentAId,
          category: FinancialTransactionCategory.SESSION,
          paymentMethod: PaymentMethod.TRANSFER,
          occurredAt: '2026-01-15T10:00:00.000Z',
        }),
        transaction({
          id: expenseAId,
          organizationId: organizationAId,
          type: FinancialTransactionType.EXPENSE,
          amount: 40,
          concept: 'Tenant A expense',
          createdById: billingAId,
          category: FinancialTransactionCategory.RENT,
          paymentMethod: PaymentMethod.CASH,
          occurredAt: '2026-01-20T10:00:00.000Z',
        }),
        transaction({
          id: incomeBId,
          organizationId: organizationBId,
          type: FinancialTransactionType.INCOME,
          amount: 999,
          concept: 'Tenant B income',
          createdById: psychologistBId,
          patientId: patientBId,
          appointmentId: appointmentBId,
          category: FinancialTransactionCategory.SESSION,
          paymentMethod: PaymentMethod.TRANSFER,
          occurredAt: '2026-01-15T10:00:00.000Z',
        }),
        transaction({
          id: incomeLegacyId,
          organizationId: null,
          type: FinancialTransactionType.INCOME,
          amount: 500,
          concept: 'Legacy income',
          createdById: billingAId,
          occurredAt: '2026-01-15T10:00:00.000Z',
        }),
      ],
    });
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

function user(id: string, email: string, passwordHash = 'not-a-real-password') {
  return {
    id,
    name: 'Integrated Tenant Test User',
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
    legalName: 'Integrated Tenant Test Organization',
    displayName: 'Integrated Tenant Test',
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
  status: PatientAssignmentStatus = PatientAssignmentStatus.ACTIVE,
) {
  return {
    organizationId,
    patientId,
    membershipId,
    role: PatientAssignmentRole.PRIMARY,
    status,
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
    diagnosis: 'Integrated diagnosis',
    treatmentPlan: 'Integrated plan',
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
    sessionDate: new Date('2026-01-05T10:00:00.000Z'),
    title: 'Integrated seed note',
    content: 'Integrated seed content',
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

function accessToken(value: unknown): string {
  if (!isRecord(value) || typeof value.accessToken !== 'string') {
    throw new Error('Expected a login response with access token');
  }

  return value.accessToken;
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error('Expected an object response');
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
