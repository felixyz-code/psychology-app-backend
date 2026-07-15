import { NotFoundException } from '@nestjs/common';
import { FinancialTransactionType, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialTransactionsService } from './financial-transactions.service';

type PrismaMock = {
  financialTransaction: {
    create: jest.Mock;
    delete: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    groupBy: jest.Mock;
    update: jest.Mock;
  };
  patient: { findFirst: jest.Mock; findUnique: jest.Mock };
  appointment: { findFirst: jest.Mock; findUnique: jest.Mock };
  user: { findUnique: jest.Mock };
};

const admin: AuthenticatedUser = {
  id: 'admin-id',
  name: 'Admin',
  email: 'admin@example.test',
  role: UserRole.ADMIN,
};
const psychologistA: AuthenticatedUser = {
  id: 'psychologist-a-id',
  name: 'Psychologist A',
  email: 'a@example.test',
  role: UserRole.PSYCHOLOGIST,
};

describe('FinancialTransactionsService ownership', () => {
  let service: FinancialTransactionsService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = {
      financialTransaction: {
        create: jest.fn(),
        delete: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        groupBy: jest.fn(),
        update: jest.fn(),
      },
      patient: { findFirst: jest.fn(), findUnique: jest.fn() },
      appointment: { findFirst: jest.fn(), findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
    };
    service = new FinancialTransactionsService(
      prisma as unknown as PrismaService,
    );
  });

  const transaction = (overrides: Record<string, unknown> = {}) => ({
    id: 'transaction-id',
    createdById: psychologistA.id,
    patientId: null,
    appointmentId: null,
    ...overrides,
  });

  it('uses the documented creator-or-owned-patient-or-owned-appointment visibility filter', async () => {
    prisma.financialTransaction.findMany.mockResolvedValue([]);

    await service.findAll(psychologistA, {});

    expect(prisma.financialTransaction.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          {
            OR: [
              { createdById: psychologistA.id },
              { patient: { psychologistId: psychologistA.id } },
              { appointment: { psychologistId: psychologistA.id } },
            ],
          },
        ],
      },
      orderBy: { occurredAt: 'desc' },
    });
  });

  it('intersects requested patient and appointment filters with ownership instead of replacing it', async () => {
    prisma.financialTransaction.findMany.mockResolvedValue([]);

    await service.findAll(psychologistA, {
      patientId: 'patient-b-id',
      appointmentId: 'appointment-b-id',
    });

    expect(prisma.financialTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          patientId: 'patient-b-id',
          appointmentId: 'appointment-b-id',
          AND: [
            {
              OR: [
                { createdById: psychologistA.id },
                { patient: { psychologistId: psychologistA.id } },
                { appointment: { psychologistId: psychologistA.id } },
              ],
            },
            { patient: { psychologistId: psychologistA.id } },
            { appointment: { psychologistId: psychologistA.id } },
          ],
        },
      }),
    );
  });

  it('allows a psychologist to read a transaction created by another user when it is linked to their patient', async () => {
    prisma.financialTransaction.findFirst.mockResolvedValue(
      transaction({
        createdById: 'psychologist-b-id',
        patientId: 'patient-a-id',
      }),
    );

    await expect(
      service.findOne(psychologistA, 'transaction-id'),
    ).resolves.toMatchObject({ patientId: 'patient-a-id' });
    expect(prisma.financialTransaction.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'transaction-id',
        OR: [
          { createdById: psychologistA.id },
          { patient: { psychologistId: psychologistA.id } },
          { appointment: { psychologistId: psychologistA.id } },
        ],
      },
    });
  });

  it('allows a psychologist to read a transaction created by another user when it is linked to their appointment', async () => {
    prisma.financialTransaction.findFirst.mockResolvedValue(
      transaction({
        createdById: 'psychologist-b-id',
        appointmentId: 'appointment-a-id',
      }),
    );

    await expect(
      service.findOne(psychologistA, 'transaction-id'),
    ).resolves.toMatchObject({ appointmentId: 'appointment-a-id' });
  });

  it('allows a psychologist to read their own general transaction without relations', async () => {
    prisma.financialTransaction.findFirst.mockResolvedValue(transaction());

    await expect(
      service.findOne(psychologistA, 'transaction-a-id'),
    ).resolves.toMatchObject({ createdById: psychologistA.id });
  });

  it('returns 404 and does not mutate a transaction exclusively visible to psychologist B', async () => {
    prisma.financialTransaction.findFirst.mockResolvedValue(null);

    await expect(
      service.update(psychologistA, 'transaction-b-id', { concept: 'changed' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.remove(psychologistA, 'transaction-b-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.financialTransaction.update).not.toHaveBeenCalled();
    expect(prisma.financialTransaction.delete).not.toHaveBeenCalled();
  });

  it('prevents creation under psychologist B patient or appointment and forces the creator to A', async () => {
    prisma.patient.findFirst.mockResolvedValue(null);
    await expect(
      service.create(psychologistA, {
        type: FinancialTransactionType.INCOME,
        amount: 100,
        concept: 'test',
        occurredAt: new Date(),
        patientId: 'patient-b-id',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.financialTransaction.create).not.toHaveBeenCalled();

    prisma.patient.findFirst.mockResolvedValue({ id: 'patient-a-id' });
    prisma.appointment.findFirst.mockResolvedValue(null);
    await expect(
      service.create(psychologistA, {
        type: FinancialTransactionType.INCOME,
        amount: 100,
        concept: 'test',
        occurredAt: new Date(),
        patientId: 'patient-a-id',
        appointmentId: 'appointment-b-id',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.financialTransaction.create).not.toHaveBeenCalled();

    prisma.patient.findFirst.mockResolvedValue({ id: 'patient-a-id' });
    prisma.appointment.findFirst.mockResolvedValue({
      id: 'appointment-a-id',
      patientId: 'patient-a-id',
    });
    prisma.financialTransaction.create.mockResolvedValue(transaction());
    await service.create(psychologistA, {
      type: FinancialTransactionType.INCOME,
      amount: 100,
      concept: 'test',
      occurredAt: new Date(),
      patientId: 'patient-a-id',
      appointmentId: 'appointment-a-id',
      createdById: 'psychologist-b-id',
    });
    expect(prisma.financialTransaction.create).toHaveBeenCalledTimes(1);
    const transactionCreateCalls = prisma.financialTransaction.create.mock
      .calls as unknown as [[{ data: { createdById: string } }]];
    expect(transactionCreateCalls[0][0].data.createdById).toBe(
      psychologistA.id,
    );
  });

  it('calculates summaries from the same visibility-filtered transaction query', async () => {
    prisma.financialTransaction.groupBy.mockResolvedValue([
      {
        type: FinancialTransactionType.INCOME,
        _sum: { amount: { toNumber: () => 100 } },
        _count: { _all: 1 },
      },
      {
        type: FinancialTransactionType.EXPENSE,
        _sum: { amount: { toNumber: () => 25 } },
        _count: { _all: 1 },
      },
    ]);

    await expect(service.getSummary(psychologistA, {})).resolves.toEqual({
      incomeTotal: 100,
      expenseTotal: 25,
      adjustmentTotal: 0,
      refundTotal: 0,
      netTotal: 75,
      transactionCount: 2,
    });
    const summaryQueryCalls = prisma.financialTransaction.groupBy.mock
      .calls as unknown as [
      [
        {
          where: { AND: unknown[] };
          by: string[];
          _sum: { amount: boolean };
          _count: { _all: boolean };
        },
      ],
    ];
    const summaryQuery = summaryQueryCalls[0][0];
    expect(summaryQuery.where.AND).toEqual(expect.any(Array));
    expect(summaryQuery.by).toEqual(['type']);
    expect(summaryQuery._sum).toEqual({ amount: true });
    expect(summaryQuery._count).toEqual({ _all: true });
  });

  it('keeps admin global: no ownership filter is added', async () => {
    prisma.financialTransaction.findMany.mockResolvedValue([]);
    prisma.financialTransaction.findUnique.mockResolvedValue(
      transaction({ createdById: 'psychologist-b-id' }),
    );

    await service.findAll(admin, {});
    await expect(
      service.findOne(admin, 'transaction-b-id'),
    ).resolves.toBeDefined();

    expect(prisma.financialTransaction.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { occurredAt: 'desc' },
    });
    expect(prisma.financialTransaction.findUnique).toHaveBeenCalledWith({
      where: { id: 'transaction-b-id' },
    });
  });
});
