import { INestApplication } from '@nestjs/common';
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
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { normalizeEmailIdentity } from '../src/common/identity/email-identity.util';

const describeCertification =
  process.env.RUN_SCHEDULING_FINANCIAL_TENANT_CERTIFICATION_TESTS === 'true'
    ? describe
    : describe.skip;

describeCertification(
  'Scheduling and financial tenant-aware HTTP certification',
  () => {
    let app: INestApplication<App>;
    let prisma: PrismaClient;
    let jwtService: JwtService;
    const databaseUrl = process.env.DATABASE_URL;
    const suffix = randomUUID();
    const password = 'SchedulingFinancialTenantTest1!';
    const organizationAId = randomUUID();
    const organizationBId = randomUUID();
    const organizationSuspendedId = randomUUID();
    const membershipOwnerAId = randomUUID();
    const membershipAdminAId = randomUUID();
    const membershipPsychologistAId = randomUUID();
    const membershipPsychologistBId = randomUUID();
    const membershipReceptionistAId = randomUUID();
    const membershipBillingAId = randomUUID();
    const membershipAuditorAId = randomUUID();
    const membershipReadOnlyAId = randomUUID();
    const membershipSuspendedAId = randomUUID();
    const membershipSuspendedOrgId = randomUUID();
    const ownerAId = randomUUID();
    const adminAId = randomUUID();
    const psychologistAId = randomUUID();
    const psychologistBId = randomUUID();
    const receptionistAId = randomUUID();
    const billingAId = randomUUID();
    const auditorAId = randomUUID();
    const readOnlyAId = randomUUID();
    const suspendedMemberAId = randomUUID();
    const suspendedOrgUserId = randomUUID();
    const noMembershipUserId = randomUUID();
    const patientAId = randomUUID();
    const patientA2Id = randomUUID();
    const patientBId = randomUUID();
    const patientLegacyId = randomUUID();
    const appointmentAId = randomUUID();
    const appointmentA2Id = randomUUID();
    const appointmentBId = randomUUID();
    const appointmentLegacyId = randomUUID();
    const transactionIncomeAId = randomUUID();
    const transactionExpenseAId = randomUUID();
    const transactionGeneralAId = randomUUID();
    const transactionBId = randomUUID();
    const transactionLegacyId = randomUUID();
    const createdAppointmentIds: string[] = [];
    const createdTransactionIds: string[] = [];

    beforeAll(async () => {
      if (
        !databaseUrl ||
        !new URL(databaseUrl).pathname.slice(1).endsWith('_test')
      ) {
        throw new Error(
          'Scheduling and financial tenant certification requires DATABASE_URL ending in _test',
        );
      }

      process.env.DATABASE_URL = databaseUrl;
      process.env.JWT_SECRET = 'Qx7Za9Lp4Vm2Kr8Nj5Hs6Dt3Bw1Cy0Fu7Eg9Ra2';
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
      await prisma?.financialTransaction.deleteMany({
        where: {
          id: {
            in: [
              transactionIncomeAId,
              transactionExpenseAId,
              transactionGeneralAId,
              transactionBId,
              transactionLegacyId,
              ...createdTransactionIds,
            ],
          },
        },
      });
      await prisma?.appointment.deleteMany({
        where: {
          id: {
            in: [
              appointmentAId,
              appointmentA2Id,
              appointmentBId,
              appointmentLegacyId,
              ...createdAppointmentIds,
            ],
          },
        },
      });
      await prisma?.patientAssignment.deleteMany({
        where: {
          patientId: {
            in: [patientAId, patientA2Id, patientBId, patientLegacyId],
          },
        },
      });
      await prisma?.patient.deleteMany({
        where: {
          id: { in: [patientAId, patientA2Id, patientBId, patientLegacyId] },
        },
      });
      await prisma?.organizationMembership.deleteMany({
        where: {
          userId: {
            in: [
              ownerAId,
              adminAId,
              psychologistAId,
              psychologistBId,
              receptionistAId,
              billingAId,
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
          id: {
            in: [organizationAId, organizationBId, organizationSuspendedId],
          },
        },
      });
      await prisma?.user.deleteMany({
        where: {
          id: {
            in: [
              ownerAId,
              adminAId,
              psychologistAId,
              psychologistBId,
              receptionistAId,
              billingAId,
              auditorAId,
              readOnlyAId,
              suspendedMemberAId,
              suspendedOrgUserId,
              noMembershipUserId,
            ],
          },
        },
      });
      await prisma?.$disconnect();
    });

    it('authenticates through login and resolves tenant context without exposing token data in context', async () => {
      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: `d3-billing-a-${suffix}@example.test`,
          password,
        })
        .expect(201);
      const token = accessToken(login.body);

      const context = await request(app.getHttpServer())
        .get('/auth/context')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(context.body).toMatchObject({
        status: 'ACTIVE_TENANT_READY',
        preferredOrganizationId: null,
        tenantContext: {
          userId: billingAId,
          organizationId: organizationAId,
          membershipId: membershipBillingAId,
          organizationRole: MembershipRole.BILLING,
        },
      });
      const contextBody: unknown = context.body;
      if (!isRecord(contextBody) || !isRecord(contextBody.tenantContext)) {
        throw new Error('Expected tenant context response');
      }
      expect(contextBody.tenantContext).not.toHaveProperty('accessToken');
    });

    it('isolates appointment reads and protects clinical notes projections', async () => {
      const psychologistToken = bearerToken(psychologistAId);
      const listed = await request(app.getHttpServer())
        .get('/appointments')
        .set('Authorization', psychologistToken)
        .expect(200);
      expect(ids(listed.body)).toEqual([appointmentA2Id, appointmentAId]);
      expect(listed.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: appointmentAId,
            notes: 'Clinical appointment note',
          }),
        ]),
      );

      const ownAppointment = await request(app.getHttpServer())
        .get(`/appointments/${appointmentAId}`)
        .set('Authorization', psychologistToken)
        .expect(200);
      expect(ownAppointment.body).toMatchObject({
        id: appointmentAId,
        notes: 'Clinical appointment note',
      });

      const adminAppointment = await request(app.getHttpServer())
        .get(`/appointments/${appointmentAId}`)
        .set('Authorization', bearerToken(adminAId))
        .expect(200);
      expect(adminAppointment.body).not.toHaveProperty('notes');

      const ownerAppointment = await request(app.getHttpServer())
        .get(`/appointments/${appointmentAId}`)
        .set('Authorization', bearerToken(ownerAId))
        .expect(200);
      expect(ownerAppointment.body).not.toHaveProperty('notes');

      const receptionistToken = bearerToken(receptionistAId);
      const receptionistAppointment = await request(app.getHttpServer())
        .get(`/appointments/${appointmentAId}`)
        .set('Authorization', receptionistToken)
        .expect(200);
      expect(receptionistAppointment.body).not.toHaveProperty('notes');

      await request(app.getHttpServer())
        .get(`/appointments/${appointmentBId}`)
        .set('Authorization', psychologistToken)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/appointments/${appointmentLegacyId}`)
        .set('Authorization', psychologistToken)
        .expect(404);
    });

    it('blocks cross-tenant appointment writes and allows receptionist operational updates only', async () => {
      const receptionistToken = bearerToken(receptionistAId);

      await request(app.getHttpServer())
        .patch(`/appointments/${appointmentAId}`)
        .set('Authorization', receptionistToken)
        .send({ notes: 'Blocked edit' })
        .expect(403);
      let appointment = await prisma.appointment.findUniqueOrThrow({
        where: { id: appointmentAId },
      });
      expect(appointment).toMatchObject({
        status: AppointmentStatus.SCHEDULED,
        notes: 'Clinical appointment note',
      });

      await request(app.getHttpServer())
        .patch(`/appointments/${appointmentAId}`)
        .set('Authorization', receptionistToken)
        .send({ status: AppointmentStatus.CANCELLED })
        .expect(200);
      appointment = await prisma.appointment.findUniqueOrThrow({
        where: { id: appointmentAId },
      });
      expect(appointment).toMatchObject({
        status: AppointmentStatus.CANCELLED,
        notes: 'Clinical appointment note',
      });

      const psychologistToken = bearerToken(psychologistAId);
      await request(app.getHttpServer())
        .patch(`/appointments/${appointmentBId}`)
        .set('Authorization', psychologistToken)
        .send({ status: AppointmentStatus.COMPLETED })
        .expect(404);
      await request(app.getHttpServer())
        .delete(`/appointments/${appointmentBId}`)
        .set('Authorization', psychologistToken)
        .expect(404);
      const blockedAppointment = await prisma.appointment.findUniqueOrThrow({
        where: { id: appointmentBId },
      });
      expect(blockedAppointment.status).toBe(AppointmentStatus.SCHEDULED);
    });

    it('stamps appointments with the selected tenant and rejects foreign relations', async () => {
      await request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', bearerToken(receptionistAId))
        .send({
          patientId: patientAId,
          psychologistId: psychologistAId,
          scheduledAt: '2026-02-01T10:00:00.000Z',
          durationMinutes: 50,
          notes: '',
        })
        .expect(403);

      const created = await request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', bearerToken(psychologistAId))
        .send({
          organizationId: organizationBId,
          patientId: patientAId,
          psychologistId: psychologistAId,
          scheduledAt: '2026-02-01T10:00:00.000Z',
          durationMinutes: 50,
        })
        .expect(201);
      const createdId = id(created.body);
      createdAppointmentIds.push(createdId);
      expect(created.body).toHaveProperty('notes', null);

      const persisted = await prisma.appointment.findUniqueOrThrow({
        where: { id: createdId },
      });
      expect(persisted).toMatchObject({
        organizationId: organizationAId,
        patientId: patientAId,
        psychologistId: psychologistAId,
      });

      await request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', bearerToken(psychologistAId))
        .send({
          patientId: patientBId,
          psychologistId: psychologistAId,
          scheduledAt: '2026-02-01T10:00:00.000Z',
          durationMinutes: 50,
        })
        .expect(404);

      await request(app.getHttpServer())
        .post('/appointments')
        .set('Authorization', bearerToken(psychologistAId))
        .send({
          patientId: patientAId,
          psychologistId: psychologistBId,
          scheduledAt: '2026-02-01T10:00:00.000Z',
          durationMinutes: 50,
        })
        .expect(404);
    });

    it('isolates financial CRUD, server-derived creator, and relation validation', async () => {
      const billingToken = bearerToken(billingAId);
      const listed = await request(app.getHttpServer())
        .get('/financial-transactions')
        .set('Authorization', billingToken)
        .expect(200);
      expect(ids(listed.body).sort()).toEqual(
        [
          transactionIncomeAId,
          transactionExpenseAId,
          transactionGeneralAId,
        ].sort(),
      );

      const created = await request(app.getHttpServer())
        .post('/financial-transactions')
        .set('Authorization', billingToken)
        .send({
          organizationId: organizationBId,
          createdById: psychologistBId,
          type: FinancialTransactionType.INCOME,
          status: FinancialTransactionStatus.COMPLETED,
          category: FinancialTransactionCategory.SESSION,
          paymentMethod: PaymentMethod.TRANSFER,
          amount: 45,
          concept: 'Tenant-stamped payment',
          occurredAt: '2026-02-03T10:00:00.000Z',
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
        patientId: patientAId,
        appointmentId: appointmentAId,
      });

      await request(app.getHttpServer())
        .get(`/financial-transactions/${transactionBId}`)
        .set('Authorization', billingToken)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/financial-transactions/${transactionLegacyId}`)
        .set('Authorization', billingToken)
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/financial-transactions/${transactionBId}`)
        .set('Authorization', billingToken)
        .send({ concept: 'Blocked' })
        .expect(404);
      await request(app.getHttpServer())
        .delete(`/financial-transactions/${transactionBId}`)
        .set('Authorization', billingToken)
        .expect(404);
      const blockedTransaction =
        await prisma.financialTransaction.findUniqueOrThrow({
          where: { id: transactionBId },
        });
      expect(blockedTransaction.concept).toBe('Foreign transaction');

      await request(app.getHttpServer())
        .post('/financial-transactions')
        .set('Authorization', billingToken)
        .send({
          type: FinancialTransactionType.INCOME,
          amount: 10,
          concept: 'Foreign patient',
          occurredAt: '2026-02-03T10:00:00.000Z',
          patientId: patientBId,
        })
        .expect(404);
      await request(app.getHttpServer())
        .post('/financial-transactions')
        .set('Authorization', billingToken)
        .send({
          type: FinancialTransactionType.INCOME,
          amount: 10,
          concept: 'Foreign appointment',
          occurredAt: '2026-02-03T10:00:00.000Z',
          appointmentId: appointmentBId,
        })
        .expect(404);
      await request(app.getHttpServer())
        .post('/financial-transactions')
        .set('Authorization', billingToken)
        .send({
          type: FinancialTransactionType.INCOME,
          amount: 10,
          concept: 'Mismatched relation',
          occurredAt: '2026-02-03T10:00:00.000Z',
          patientId: patientAId,
          appointmentId: appointmentA2Id,
        })
        .expect(400);
    });

    it('keeps financial summary tenant-scoped across filters and requires finance.summary_read', async () => {
      const billingToken = bearerToken(billingAId);

      const summary = await request(app.getHttpServer())
        .get('/financial-transactions/summary')
        .set('Authorization', billingToken)
        .expect(200);
      expect(summary.body).toMatchObject({
        incomeTotal: 170,
        expenseTotal: 30,
        adjustmentTotal: 0,
        refundTotal: 0,
        netTotal: 140,
        transactionCount: 4,
      });

      await expectSummary('/financial-transactions/summary?from=2026-02-01', {
        incomeTotal: 70,
        expenseTotal: 30,
        netTotal: 40,
        transactionCount: 3,
      });
      await expectSummary(
        `/financial-transactions/summary?category=${FinancialTransactionCategory.SESSION}`,
        {
          incomeTotal: 145,
          expenseTotal: 0,
          netTotal: 145,
          transactionCount: 2,
        },
      );
      await expectSummary(
        `/financial-transactions/summary?paymentMethod=${PaymentMethod.CASH}`,
        {
          incomeTotal: 25,
          expenseTotal: 0,
          netTotal: 25,
          transactionCount: 1,
        },
      );
      await expectSummary(
        `/financial-transactions/summary?patientId=${patientAId}`,
        {
          incomeTotal: 145,
          expenseTotal: 0,
          netTotal: 145,
          transactionCount: 2,
        },
      );
      await expectSummary(
        `/financial-transactions/summary?appointmentId=${appointmentAId}`,
        {
          incomeTotal: 145,
          expenseTotal: 0,
          netTotal: 145,
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

      await request(app.getHttpServer())
        .get('/financial-transactions/summary')
        .set('Authorization', bearerToken(receptionistAId))
        .expect(403);
      await request(app.getHttpServer())
        .get('/financial-transactions/summary')
        .set('Authorization', bearerToken(psychologistAId))
        .expect(403);
      await request(app.getHttpServer())
        .get('/financial-transactions/summary')
        .set('Authorization', bearerToken(auditorAId))
        .expect(403);
      await request(app.getHttpServer())
        .get('/financial-transactions/summary')
        .set('Authorization', bearerToken(readOnlyAId))
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

    it('denies suspended membership, suspended organization, no membership, and non-financial roles', async () => {
      await request(app.getHttpServer())
        .get('/appointments')
        .set('Authorization', bearerToken(suspendedMemberAId))
        .set('X-Organization-Id', organizationAId)
        .expect(403);
      await request(app.getHttpServer())
        .get('/appointments')
        .set('Authorization', bearerToken(suspendedOrgUserId))
        .set('X-Organization-Id', organizationSuspendedId)
        .expect(403);
      await request(app.getHttpServer())
        .get('/appointments')
        .set('Authorization', bearerToken(noMembershipUserId))
        .expect(403);
      await request(app.getHttpServer())
        .get('/financial-transactions')
        .set('Authorization', bearerToken(receptionistAId))
        .expect(403);
      await request(app.getHttpServer())
        .post('/financial-transactions')
        .set('Authorization', bearerToken(psychologistAId))
        .send({
          type: FinancialTransactionType.INCOME,
          amount: 10,
          concept: 'Denied finance',
          occurredAt: '2026-02-03T10:00:00.000Z',
        })
        .expect(403);
    });

    function bearerToken(userId: string) {
      return `Bearer ${jwtService.sign({
        sub: userId,
        name: 'Scheduling Financial Tenant Test User',
        email: 'scheduling-financial-tenant@example.test',
        role: UserRole.PSYCHOLOGIST,
      })}`;
    }

    async function seedFixture() {
      const passwordHash = await bcrypt.hash(password, 10);
      await prisma.user.createMany({
        data: [
          user(ownerAId, `d3-owner-a-${suffix}@example.test`),
          user(adminAId, `d3-admin-a-${suffix}@example.test`),
          user(psychologistAId, `d3-psychologist-a-${suffix}@example.test`),
          user(psychologistBId, `d3-psychologist-b-${suffix}@example.test`),
          user(receptionistAId, `d3-receptionist-a-${suffix}@example.test`),
          user(billingAId, `d3-billing-a-${suffix}@example.test`, passwordHash),
          user(auditorAId, `d3-auditor-a-${suffix}@example.test`),
          user(readOnlyAId, `d3-read-only-a-${suffix}@example.test`),
          user(suspendedMemberAId, `d3-suspended-a-${suffix}@example.test`),
          user(suspendedOrgUserId, `d3-suspended-org-${suffix}@example.test`),
          user(noMembershipUserId, `d3-no-membership-${suffix}@example.test`),
        ],
      });
      await prisma.organization.createMany({
        data: [
          organization(organizationAId, `d3-a-${suffix}`),
          organization(organizationBId, `d3-b-${suffix}`),
          organization(
            organizationSuspendedId,
            `d3-suspended-${suffix}`,
            OrganizationStatus.SUSPENDED,
          ),
        ],
      });
      await prisma.organizationMembership.createMany({
        data: [
          membership(
            membershipOwnerAId,
            ownerAId,
            organizationAId,
            MembershipRole.OWNER,
          ),
          membership(
            membershipAdminAId,
            adminAId,
            organizationAId,
            MembershipRole.ADMIN,
          ),
          membership(
            membershipPsychologistAId,
            psychologistAId,
            organizationAId,
          ),
          membership(
            membershipPsychologistBId,
            psychologistBId,
            organizationBId,
          ),
          membership(
            membershipReceptionistAId,
            receptionistAId,
            organizationAId,
            MembershipRole.RECEPTIONIST,
          ),
          membership(
            membershipBillingAId,
            billingAId,
            organizationAId,
            MembershipRole.BILLING,
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
          patient(patientAId, organizationAId, psychologistAId, 'A'),
          patient(patientA2Id, organizationAId, psychologistAId, 'A2'),
          patient(patientBId, organizationBId, psychologistBId, 'B'),
          patient(patientLegacyId, null, psychologistAId, 'Legacy'),
        ],
      });
      await prisma.patientAssignment.createMany({
        data: [
          assignment(organizationAId, patientAId, membershipPsychologistAId),
          assignment(organizationAId, patientA2Id, membershipPsychologistAId),
          assignment(organizationBId, patientBId, membershipPsychologistBId),
          assignment(
            organizationAId,
            patientLegacyId,
            membershipPsychologistAId,
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
            'Clinical appointment note',
            '2026-02-01T11:00:00.000Z',
          ),
          appointment(
            appointmentA2Id,
            organizationAId,
            patientA2Id,
            psychologistAId,
            'Second clinical appointment note',
            '2026-02-02T11:00:00.000Z',
          ),
          appointment(
            appointmentBId,
            organizationBId,
            patientBId,
            psychologistBId,
            'Foreign clinical appointment note',
            '2026-02-01T12:00:00.000Z',
          ),
          appointment(
            appointmentLegacyId,
            null,
            patientLegacyId,
            psychologistAId,
            'Legacy clinical appointment note',
            '2026-02-01T13:00:00.000Z',
          ),
        ],
      });
      await prisma.financialTransaction.createMany({
        data: [
          transaction({
            id: transactionIncomeAId,
            organizationId: organizationAId,
            type: FinancialTransactionType.INCOME,
            amount: 100,
            concept: 'Tenant income',
            createdById: billingAId,
            patientId: patientAId,
            appointmentId: appointmentAId,
            category: FinancialTransactionCategory.SESSION,
            paymentMethod: PaymentMethod.TRANSFER,
            occurredAt: '2026-01-15T10:00:00.000Z',
          }),
          transaction({
            id: transactionExpenseAId,
            organizationId: organizationAId,
            type: FinancialTransactionType.EXPENSE,
            amount: 30,
            concept: 'Tenant expense',
            createdById: billingAId,
            category: FinancialTransactionCategory.RENT,
            paymentMethod: PaymentMethod.CARD,
            occurredAt: '2026-02-02T10:00:00.000Z',
          }),
          transaction({
            id: transactionGeneralAId,
            organizationId: organizationAId,
            type: FinancialTransactionType.INCOME,
            amount: 25,
            concept: 'Tenant general income',
            createdById: billingAId,
            category: FinancialTransactionCategory.MANUAL,
            paymentMethod: PaymentMethod.CASH,
            occurredAt: '2026-02-03T10:00:00.000Z',
          }),
          transaction({
            id: transactionBId,
            organizationId: organizationBId,
            type: FinancialTransactionType.INCOME,
            amount: 999,
            concept: 'Foreign transaction',
            createdById: psychologistBId,
            patientId: patientBId,
            appointmentId: appointmentBId,
            category: FinancialTransactionCategory.SESSION,
            paymentMethod: PaymentMethod.TRANSFER,
            occurredAt: '2026-02-02T10:00:00.000Z',
          }),
          transaction({
            id: transactionLegacyId,
            organizationId: null,
            type: FinancialTransactionType.INCOME,
            amount: 500,
            concept: 'Legacy transaction',
            createdById: billingAId,
            occurredAt: '2026-02-02T10:00:00.000Z',
          }),
        ],
      });
    }
  },
);

function user(id: string, email: string, passwordHash = 'not-a-real-password') {
  return {
    id,
    name: 'Scheduling Financial Tenant Test User',
    email,
    normalizedEmail: normalizeEmailIdentity(email),
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
    legalName: 'Scheduling Financial Tenant Test Organization',
    displayName: 'Scheduling Financial Tenant Test',
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
