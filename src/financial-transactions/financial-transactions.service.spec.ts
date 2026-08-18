import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  FinancialTransactionType,
  MembershipRole,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantResolutionMode } from '../common/request-context/request-context.service';
import {
  CapabilityDecision,
  OrganizationCapability,
} from '../tenant-context/authorization/organization-capability';
import { OrganizationPolicyService } from '../tenant-context/authorization/organization-policy.service';
import type { ClinicalAccessScope } from '../tenant-context/clinical-access.types';
import { TenantObservabilityService } from '../tenant-context/tenant-observability.service';
import { FinancialTransactionsService } from './financial-transactions.service';

type PrismaMock = {
  financialTransaction: {
    create: jest.Mock;
    deleteMany: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    groupBy: jest.Mock;
    updateMany: jest.Mock;
  };
  patient: { findFirst: jest.Mock };
  appointment: { findFirst: jest.Mock };
};

describe('FinancialTransactionsService tenant isolation', () => {
  let service: FinancialTransactionsService;
  let prisma: PrismaMock;
  let policy: { decisionFor: jest.Mock };
  let observability: { capabilityDenied: jest.Mock };

  beforeEach(() => {
    prisma = {
      financialTransaction: {
        create: jest.fn(),
        deleteMany: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        groupBy: jest.fn(),
        updateMany: jest.fn(),
      },
      patient: { findFirst: jest.fn() },
      appointment: { findFirst: jest.fn() },
    };
    policy = {
      decisionFor: jest.fn((scope: ClinicalAccessScope, capability: string) =>
        decisionFor(scope.organizationRole, capability),
      ),
    };
    observability = { capabilityDenied: jest.fn() };
    service = new FinancialTransactionsService(
      prisma as unknown as PrismaService,
      policy as unknown as OrganizationPolicyService,
      observability as unknown as TenantObservabilityService,
    );
  });

  it('lists with an immutable organization predicate and supported filters', async () => {
    prisma.financialTransaction.findMany.mockResolvedValue([]);

    await service.findAll(scope(MembershipRole.BILLING), {
      patientId: 'patient-a-id',
      createdById: 'user-a-id',
    });

    expect(prisma.financialTransaction.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'organization-a-id',
        patientId: 'patient-a-id',
        createdById: 'user-a-id',
      },
      orderBy: { occurredAt: 'desc' },
    });
  });

  it('creates general tenant-scoped transactions and derives createdById from scope', async () => {
    prisma.financialTransaction.create.mockResolvedValue(transaction());

    await service.create(scope(MembershipRole.BILLING, 'billing-a-id'), {
      type: FinancialTransactionType.INCOME,
      amount: 100,
      concept: 'test',
      occurredAt: new Date(),
      createdById: 'forged-user-id',
    } as never);

    const createCall = firstMockArg<{ data: Record<string, unknown> }>(
      prisma.financialTransaction.create,
    );
    expect(createCall.data.organizationId).toBe('organization-a-id');
    expect(createCall.data.createdById).toBe('billing-a-id');
    expect(createCall.data.createdById).not.toBe('forged-user-id');
  });

  it('rejects foreign patient or appointment relations before writing', async () => {
    prisma.patient.findFirst.mockResolvedValue(null);

    await expect(
      service.create(scope(MembershipRole.BILLING), {
        type: FinancialTransactionType.INCOME,
        amount: 100,
        concept: 'test',
        occurredAt: new Date(),
        patientId: 'patient-b-id',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.financialTransaction.create).not.toHaveBeenCalled();
  });

  it('rejects visible but incompatible patient and appointment relations', async () => {
    prisma.patient.findFirst.mockResolvedValue({ id: 'patient-a-id' });
    prisma.appointment.findFirst.mockResolvedValue({
      id: 'appointment-a-id',
      patientId: 'patient-other-id',
    });

    await expect(
      service.create(scope(MembershipRole.BILLING), {
        type: FinancialTransactionType.INCOME,
        amount: 100,
        concept: 'test',
        occurredAt: new Date(),
        patientId: 'patient-a-id',
        appointmentId: 'appointment-a-id',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.financialTransaction.create).not.toHaveBeenCalled();
  });

  it('uses tenant-scoped direct reads, updates, and deletes', async () => {
    prisma.financialTransaction.findFirst.mockResolvedValue(transaction());
    prisma.financialTransaction.updateMany.mockResolvedValue({ count: 1 });
    prisma.financialTransaction.deleteMany.mockResolvedValue({ count: 1 });

    await service.findOne(scope(MembershipRole.BILLING), 'transaction-a-id');
    await service.update(scope(MembershipRole.BILLING), 'transaction-a-id', {
      concept: 'changed',
    });
    await service.remove(scope(MembershipRole.BILLING), 'transaction-a-id');

    expect(prisma.financialTransaction.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'transaction-a-id',
        organizationId: 'organization-a-id',
      },
    });
    expect(prisma.financialTransaction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'transaction-a-id', organizationId: 'organization-a-id' },
      }),
    );
    expect(prisma.financialTransaction.deleteMany).toHaveBeenCalledWith({
      where: { id: 'transaction-a-id', organizationId: 'organization-a-id' },
    });
  });

  it('returns 404 and has no mutation side effect for cross-tenant IDs', async () => {
    prisma.financialTransaction.findFirst.mockResolvedValue(null);

    await expect(
      service.update(scope(MembershipRole.BILLING), 'transaction-b-id', {
        concept: 'changed',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.remove(scope(MembershipRole.BILLING), 'transaction-b-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.financialTransaction.updateMany).not.toHaveBeenCalled();
    expect(prisma.financialTransaction.deleteMany).not.toHaveBeenCalled();
  });

  it('uses finance.summary_read and tenant-scoped groupBy for summary', async () => {
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

    await expect(
      service.getSummary(scope(MembershipRole.BILLING), {}),
    ).resolves.toEqual({
      incomeTotal: 100,
      expenseTotal: 25,
      adjustmentTotal: 0,
      refundTotal: 0,
      netTotal: 75,
      transactionCount: 2,
    });
    expect(policy.decisionFor).toHaveBeenCalledWith(
      expect.any(Object),
      OrganizationCapability.FINANCE_SUMMARY_READ,
    );
    expect(prisma.financialTransaction.groupBy).toHaveBeenCalledWith({
      where: { organizationId: 'organization-a-id' },
      by: ['type'],
      _sum: { amount: true },
      _count: { _all: true },
    });
  });

  it('denies non-financial roles without using report.read as a bypass', async () => {
    await expect(
      service.getSummary(scope(MembershipRole.RECEPTIONIST), {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.financialTransaction.groupBy).not.toHaveBeenCalled();
    expect(observability.capabilityDenied).toHaveBeenCalledWith(
      expect.any(Object),
      OrganizationCapability.FINANCE_SUMMARY_READ,
      'financial_transactions.summary',
    );
  });
});

function decisionFor(role: MembershipRole, capability: string) {
  if (role === MembershipRole.OWNER) {
    return CapabilityDecision.ALLOW;
  }

  if (role === MembershipRole.ADMIN || role === MembershipRole.BILLING) {
    return [
      OrganizationCapability.FINANCE_READ,
      OrganizationCapability.FINANCE_MANAGE,
      OrganizationCapability.FINANCE_SUMMARY_READ,
    ].includes(capability as OrganizationCapability)
      ? CapabilityDecision.ALLOW
      : CapabilityDecision.DENY;
  }

  return CapabilityDecision.DENY;
}

function scope(
  organizationRole: MembershipRole,
  userId = 'user-a-id',
): ClinicalAccessScope {
  return {
    organizationId: 'organization-a-id',
    membershipId: 'membership-a-id',
    organizationRole,
    userId,
    legacyUserRole: UserRole.PSYCHOLOGIST,
    resolutionMode: TenantResolutionMode.EXPLICIT,
  };
}

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'transaction-a-id',
    organizationId: 'organization-a-id',
    createdById: 'user-a-id',
    patientId: null,
    appointmentId: null,
    ...overrides,
  };
}

function firstMockArg<T>(mock: jest.Mock): T {
  const [firstCall] = mock.mock.calls as [unknown[]];
  return firstCall[0] as T;
}
