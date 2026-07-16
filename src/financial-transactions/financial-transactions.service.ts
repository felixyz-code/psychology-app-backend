import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FinancialTransactionType, Prisma, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFinancialTransactionDto } from './dto/create-financial-transaction.dto';
import { FindFinancialTransactionsQueryDto } from './dto/find-financial-transactions-query.dto';
import { UpdateFinancialTransactionDto } from './dto/update-financial-transaction.dto';

@Injectable()
export class FinancialTransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    user: AuthenticatedUser,
    createFinancialTransactionDto: CreateFinancialTransactionDto,
  ) {
    const { patientId, appointmentId } = createFinancialTransactionDto;

    const patient = patientId
      ? await this.getAccessiblePatientOrThrow(patientId, user)
      : null;
    const appointment = appointmentId
      ? await this.getAccessibleAppointmentOrThrow(appointmentId, user)
      : null;

    this.ensureAppointmentMatchesPatient(patient?.id, appointment?.patientId);

    const createdById = this.isAdmin(user)
      ? (createFinancialTransactionDto.createdById ?? user.id)
      : user.id;

    if (this.isAdmin(user)) {
      await this.ensureUserExists(createdById);
    }

    return this.prisma.financialTransaction.create({
      data: {
        ...createFinancialTransactionDto,
        createdById,
      },
    });
  }

  async findAll(
    user: AuthenticatedUser,
    query: FindFinancialTransactionsQueryDto,
  ) {
    return this.prisma.financialTransaction.findMany({
      where: this.buildFindManyWhere(user, query),
      orderBy: {
        occurredAt: 'desc',
      },
    });
  }

  async getSummary(
    user: AuthenticatedUser,
    query: FindFinancialTransactionsQueryDto,
  ) {
    const transactions = await this.prisma.financialTransaction.groupBy({
      where: this.buildFindManyWhere(user, query),
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

  async findOne(user: AuthenticatedUser, id: string) {
    return this.getAccessibleTransactionOrThrow(id, user);
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    updateFinancialTransactionDto: UpdateFinancialTransactionDto,
  ) {
    const existingTransaction = await this.getAccessibleTransactionOrThrow(
      id,
      user,
    );

    const patientId = Object.hasOwn(updateFinancialTransactionDto, 'patientId')
      ? (updateFinancialTransactionDto.patientId ?? null)
      : existingTransaction.patientId;
    const appointmentId = Object.hasOwn(
      updateFinancialTransactionDto,
      'appointmentId',
    )
      ? (updateFinancialTransactionDto.appointmentId ?? null)
      : existingTransaction.appointmentId;

    const patient = patientId
      ? await this.getAccessiblePatientOrThrow(patientId, user)
      : null;
    const appointment = appointmentId
      ? await this.getAccessibleAppointmentOrThrow(appointmentId, user)
      : null;

    this.ensureAppointmentMatchesPatient(patient?.id, appointment?.patientId);

    let createdById = existingTransaction.createdById;

    if (this.isAdmin(user)) {
      if (Object.hasOwn(updateFinancialTransactionDto, 'createdById')) {
        createdById = updateFinancialTransactionDto.createdById ?? createdById;
      }

      await this.ensureUserExists(createdById);
    } else {
      createdById = existingTransaction.createdById;
    }

    return this.prisma.financialTransaction.update({
      where: { id },
      data: {
        ...updateFinancialTransactionDto,
        createdById,
        patientId,
        appointmentId,
      },
    });
  }

  async remove(user: AuthenticatedUser, id: string) {
    await this.getAccessibleTransactionOrThrow(id, user);

    return this.prisma.financialTransaction.delete({
      where: { id },
    });
  }

  private isAdmin(user: AuthenticatedUser) {
    return user.role === UserRole.ADMIN;
  }

  private buildFindManyWhere(
    user: AuthenticatedUser,
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
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
      ...(paymentMethod ? { paymentMethod } : {}),
      ...(patientId ? { patientId } : {}),
      ...(appointmentId ? { appointmentId } : {}),
      ...(from || to ? { occurredAt } : {}),
      ...(this.isAdmin(user)
        ? createdById
          ? { createdById }
          : {}
        : {
            AND: [
              {
                OR: [
                  { createdById: user.id },
                  { patient: { psychologistId: user.id } },
                  { appointment: { psychologistId: user.id } },
                ],
              },
              ...(patientId ? [{ patient: { psychologistId: user.id } }] : []),
              ...(appointmentId
                ? [{ appointment: { psychologistId: user.id } }]
                : []),
              ...(createdById ? [{ createdById: user.id }] : []),
            ],
          }),
    };
  }

  private async getAccessibleTransactionOrThrow(
    id: string,
    user: AuthenticatedUser,
  ) {
    const transaction = this.isAdmin(user)
      ? await this.prisma.financialTransaction.findUnique({ where: { id } })
      : await this.prisma.financialTransaction.findFirst({
          where: {
            id,
            OR: [
              { createdById: user.id },
              { patient: { psychologistId: user.id } },
              { appointment: { psychologistId: user.id } },
            ],
          },
        });

    if (!transaction) {
      throw new NotFoundException(
        `Financial transaction with id "${id}" not found`,
      );
    }

    return transaction;
  }

  private async getAccessiblePatientOrThrow(
    patientId: string,
    user: AuthenticatedUser,
  ) {
    const patient = this.isAdmin(user)
      ? await this.prisma.patient.findUnique({ where: { id: patientId } })
      : await this.prisma.patient.findFirst({
          where: {
            id: patientId,
            psychologistId: user.id,
          },
        });

    if (!patient) {
      throw new NotFoundException(`Patient with id "${patientId}" not found`);
    }

    return patient;
  }

  private async getAccessibleAppointmentOrThrow(
    appointmentId: string,
    user: AuthenticatedUser,
  ) {
    const appointment = this.isAdmin(user)
      ? await this.prisma.appointment.findUnique({
          where: { id: appointmentId },
        })
      : await this.prisma.appointment.findFirst({
          where: {
            id: appointmentId,
            psychologistId: user.id,
          },
        });

    if (!appointment) {
      throw new NotFoundException(
        `Appointment with id "${appointmentId}" not found`,
      );
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

  private async ensureUserExists(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException(`User with id "${userId}" not found`);
    }
  }
}
