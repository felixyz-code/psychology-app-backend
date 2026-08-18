import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FinancialTransactionType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CapabilityDecision,
  OrganizationCapability,
} from '../tenant-context/authorization/organization-capability';
import { OrganizationPolicyService } from '../tenant-context/authorization/organization-policy.service';
import type { ClinicalAccessScope } from '../tenant-context/clinical-access.types';
import { TenantObservabilityService } from '../tenant-context/tenant-observability.service';
import { CreateFinancialTransactionDto } from './dto/create-financial-transaction.dto';
import { FindFinancialTransactionsQueryDto } from './dto/find-financial-transactions-query.dto';
import { UpdateFinancialTransactionDto } from './dto/update-financial-transaction.dto';

type FinanceScope = ClinicalAccessScope;

@Injectable()
export class FinancialTransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: OrganizationPolicyService,
    private readonly observability: TenantObservabilityService,
  ) {}

  async create(
    scope: FinanceScope,
    createFinancialTransactionDto: CreateFinancialTransactionDto,
  ) {
    this.requireFinancialCapability(
      scope,
      OrganizationCapability.FINANCE_MANAGE,
      'financial_transactions.create',
    );
    const { patientId, appointmentId } = createFinancialTransactionDto;

    const patient = patientId
      ? await this.getTenantPatientOrThrow(patientId, scope)
      : null;
    const appointment = appointmentId
      ? await this.getTenantAppointmentOrThrow(appointmentId, scope)
      : null;

    this.ensureAppointmentMatchesPatient(patient?.id, appointment?.patientId);

    return this.prisma.financialTransaction.create({
      data: {
        ...this.withoutServerFields(createFinancialTransactionDto),
        organizationId: scope.organizationId,
        createdById: scope.userId,
      },
    });
  }

  async findAll(scope: FinanceScope, query: FindFinancialTransactionsQueryDto) {
    this.requireFinancialCapability(
      scope,
      OrganizationCapability.FINANCE_READ,
      'financial_transactions.find_all',
    );

    return this.prisma.financialTransaction.findMany({
      where: this.buildFindManyWhere(scope, query),
      orderBy: {
        occurredAt: 'desc',
      },
    });
  }

  async getSummary(
    scope: FinanceScope,
    query: FindFinancialTransactionsQueryDto,
  ) {
    this.requireFinancialCapability(
      scope,
      OrganizationCapability.FINANCE_SUMMARY_READ,
      'financial_transactions.summary',
    );
    const transactions = await this.prisma.financialTransaction.groupBy({
      where: this.buildFindManyWhere(scope, query),
      by: ['type'],
      _sum: {
        amount: true,
      },
      _count: {
        _all: true,
      },
    });

    const summary = {
      incomeTotal: 0,
      expenseTotal: 0,
      adjustmentTotal: 0,
      refundTotal: 0,
      netTotal: 0,
      transactionCount: 0,
    };

    for (const transaction of transactions) {
      const amount = transaction._sum.amount?.toNumber() ?? 0;
      summary.transactionCount += transaction._count._all;

      switch (transaction.type) {
        case FinancialTransactionType.INCOME:
          summary.incomeTotal += amount;
          break;
        case FinancialTransactionType.EXPENSE:
          summary.expenseTotal += amount;
          break;
        case FinancialTransactionType.ADJUSTMENT:
          summary.adjustmentTotal += amount;
          break;
        case FinancialTransactionType.REFUND:
          summary.refundTotal += amount;
          break;
      }
    }

    summary.netTotal =
      summary.incomeTotal +
      summary.adjustmentTotal -
      summary.expenseTotal -
      summary.refundTotal;

    return summary;
  }

  async findOne(scope: FinanceScope, id: string) {
    this.requireFinancialCapability(
      scope,
      OrganizationCapability.FINANCE_READ,
      'financial_transactions.find_one',
    );
    return this.getTenantTransactionOrThrow(id, scope);
  }

  async update(
    scope: FinanceScope,
    id: string,
    updateFinancialTransactionDto: UpdateFinancialTransactionDto,
  ) {
    this.requireFinancialCapability(
      scope,
      OrganizationCapability.FINANCE_MANAGE,
      'financial_transactions.update',
    );
    const existingTransaction = await this.getTenantTransactionOrThrow(
      id,
      scope,
    );

    const patientId = hasOwn(updateFinancialTransactionDto, 'patientId')
      ? (updateFinancialTransactionDto.patientId ?? null)
      : existingTransaction.patientId;
    const appointmentId = hasOwn(updateFinancialTransactionDto, 'appointmentId')
      ? (updateFinancialTransactionDto.appointmentId ?? null)
      : existingTransaction.appointmentId;

    const patient = patientId
      ? await this.getTenantPatientOrThrow(patientId, scope)
      : null;
    const appointment = appointmentId
      ? await this.getTenantAppointmentOrThrow(appointmentId, scope)
      : null;

    this.ensureAppointmentMatchesPatient(patient?.id, appointment?.patientId);

    const result = await this.prisma.financialTransaction.updateMany({
      where: { id, organizationId: scope.organizationId },
      data: {
        ...this.withoutServerFields(updateFinancialTransactionDto),
        patientId,
        appointmentId,
      },
    });

    if (result.count !== 1) {
      throw this.transactionNotFound();
    }

    return this.getTenantTransactionOrThrow(id, scope);
  }

  async remove(scope: FinanceScope, id: string) {
    const transaction = await this.getTenantTransactionOrThrow(id, scope);
    this.requireFinancialCapability(
      scope,
      OrganizationCapability.FINANCE_MANAGE,
      'financial_transactions.remove',
    );

    const result = await this.prisma.financialTransaction.deleteMany({
      where: { id, organizationId: scope.organizationId },
    });

    if (result.count !== 1) {
      throw this.transactionNotFound();
    }

    return transaction;
  }

  private buildFindManyWhere(
    scope: FinanceScope,
    query: FindFinancialTransactionsQueryDto,
  ): Prisma.FinancialTransactionWhereInput {
    const {
      from,
      to,
      type,
      status,
      category,
      paymentMethod,
      patientId,
      appointmentId,
      createdById,
    } = query;

    const occurredAt: Prisma.DateTimeFilter = {};

    if (from) {
      occurredAt.gte = new Date(from);
    }

    if (to) {
      occurredAt.lte = new Date(to);
    }

    return {
      organizationId: scope.organizationId,
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
      ...(paymentMethod ? { paymentMethod } : {}),
      ...(patientId ? { patientId } : {}),
      ...(appointmentId ? { appointmentId } : {}),
      ...(createdById ? { createdById } : {}),
      ...(from || to ? { occurredAt } : {}),
    };
  }

  private async getTenantTransactionOrThrow(id: string, scope: FinanceScope) {
    const transaction = await this.prisma.financialTransaction.findFirst({
      where: {
        id,
        organizationId: scope.organizationId,
      },
    });

    if (!transaction) {
      throw this.transactionNotFound();
    }

    return transaction;
  }

  private async getTenantPatientOrThrow(
    patientId: string,
    scope: FinanceScope,
  ) {
    const patient = await this.prisma.patient.findFirst({
      where: {
        id: patientId,
        organizationId: scope.organizationId,
      },
      select: { id: true },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    return patient;
  }

  private async getTenantAppointmentOrThrow(
    appointmentId: string,
    scope: FinanceScope,
  ) {
    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        organizationId: scope.organizationId,
      },
      select: { id: true, patientId: true },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    return appointment;
  }

  private ensureAppointmentMatchesPatient(
    patientId?: string | null,
    appointmentPatientId?: string | null,
  ) {
    if (
      patientId &&
      appointmentPatientId &&
      patientId !== appointmentPatientId
    ) {
      throw new BadRequestException(
        'The appointment must belong to the provided patient',
      );
    }
  }

  private requireFinancialCapability(
    scope: FinanceScope,
    capability: OrganizationCapability,
    operation: string,
  ) {
    const decision = this.policy.decisionFor(scope, capability);
    if (decision === CapabilityDecision.ALLOW) {
      return;
    }

    this.observability.capabilityDenied(scope, capability, operation);
    throw new ForbiddenException('Organization capability is required');
  }

  private withoutServerFields<T extends object>(
    dto: T,
  ): Omit<T, 'organizationId' | 'createdById'> {
    const transactionData = { ...dto };
    Reflect.deleteProperty(transactionData, 'organizationId');
    Reflect.deleteProperty(transactionData, 'createdById');
    return transactionData;
  }

  private transactionNotFound() {
    return new NotFoundException('Financial transaction not found');
  }
}

function hasOwn<T extends object>(value: T, property: PropertyKey) {
  return Object.hasOwn(value, property);
}
