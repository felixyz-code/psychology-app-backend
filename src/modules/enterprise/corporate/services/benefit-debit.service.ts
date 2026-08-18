import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BenefitDebitStatus,
  BenefitDebitType,
  BenefitPoolStatus,
  EmployeeEligibilityStatus,
  PaefAgreementStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import {
  ConfirmBenefitSessionDto,
  ReleaseBenefitSessionDto,
  ReserveBenefitSessionDto,
} from '../dto/benefit-debit.dto';

@Injectable()
export class BenefitDebitService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reserves benefit sessions atomically using PostgreSQL SELECT ... FOR UPDATE pessimistic locking
   * to guarantee zero race conditions and zero pool overdrafts.
   */
  async reserveBenefitSession(
    organizationId: string,
    dto: ReserveBenefitSessionDto,
    userId?: string,
  ) {
    const quantity = dto.sessionQuantity || 1;
    if (quantity <= 0) {
      throw new BadRequestException('Session quantity must be greater than 0');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Validate PAEF Agreement
      const agreement = await tx.paefAgreement.findFirst({
        where: { id: dto.agreementId, organizationId },
      });

      if (!agreement) {
        throw new NotFoundException('PAEF agreement not found');
      }

      if (agreement.status !== PaefAgreementStatus.ACTIVE) {
        throw new BadRequestException(
          `PAEF agreement is not active (current status: ${agreement.status})`,
        );
      }

      const now = new Date();
      if (agreement.validFrom > now || agreement.validUntil < now) {
        throw new BadRequestException(
          'PAEF agreement is outside its valid date range',
        );
      }

      // Branch check
      if (!agreement.isMultiBranch && dto.branchId) {
        if (!agreement.allowedBranchIds.includes(dto.branchId)) {
          throw new BadRequestException(
            'The selected branch is not authorized under this agreement.',
          );
        }
      }

      // 2. Lock and fetch BenefitPool with SELECT ... FOR UPDATE
      const poolRows: Array<{
        id: string;
        total_sessions: number;
        consumed_sessions: number;
        reserved_sessions: number;
        status: string;
        valid_from: Date;
        valid_until: Date;
      }> = await tx.$queryRaw`
        SELECT id, total_sessions, consumed_sessions, reserved_sessions, status, valid_from, valid_until
        FROM benefit_pools
        WHERE id = ${dto.poolId}::uuid AND organization_id = ${organizationId}::uuid
        FOR UPDATE
      `;

      if (!poolRows || poolRows.length === 0) {
        throw new NotFoundException(
          'Benefit pool not found in this organization',
        );
      }

      const pool = poolRows[0];

      if (pool.status !== BenefitPoolStatus.ACTIVE) {
        throw new BadRequestException(
          `Benefit pool is not active (status: ${pool.status})`,
        );
      }

      if (pool.valid_from > now || pool.valid_until < now) {
        throw new BadRequestException(
          'Benefit pool is outside its valid date range',
        );
      }

      const currentPoolCommitment =
        pool.consumed_sessions + pool.reserved_sessions;
      if (currentPoolCommitment + quantity > pool.total_sessions) {
        throw new ConflictException(
          `Insufficient sessions in benefit pool. Available: ${Math.max(
            0,
            pool.total_sessions - currentPoolCommitment,
          )}, Requested: ${quantity}`,
        );
      }

      // 3. Lock and fetch EmployeeEligibility with SELECT ... FOR UPDATE
      const eligibilityRows: Array<{
        id: string;
        max_sessions_allowed: number;
        consumed_sessions: number;
        reserved_sessions: number;
        status: string;
      }> = await tx.$queryRaw`
        SELECT id, max_sessions_allowed, consumed_sessions, reserved_sessions, status
        FROM employee_eligibilities
        WHERE id = ${dto.eligibilityId}::uuid AND organization_id = ${organizationId}::uuid
        FOR UPDATE
      `;

      if (!eligibilityRows || eligibilityRows.length === 0) {
        throw new NotFoundException('Employee eligibility record not found');
      }

      const eligibility = eligibilityRows[0];

      if (eligibility.status !== EmployeeEligibilityStatus.ACTIVE) {
        throw new BadRequestException(
          `Employee eligibility is not active (status: ${eligibility.status})`,
        );
      }

      const currentEmployeeUsage =
        eligibility.consumed_sessions + eligibility.reserved_sessions;
      if (currentEmployeeUsage + quantity > eligibility.max_sessions_allowed) {
        throw new ConflictException(
          `Employee quota exceeded. Remaining quota: ${Math.max(
            0,
            eligibility.max_sessions_allowed - currentEmployeeUsage,
          )}, Requested: ${quantity}`,
        );
      }

      // 4. Atomically update BenefitPool
      await tx.benefitPool.update({
        where: { id: dto.poolId },
        data: {
          reservedSessions: { increment: quantity },
        },
      });

      // 5. Atomically update EmployeeEligibility
      await tx.employeeEligibility.update({
        where: { id: dto.eligibilityId },
        data: {
          reservedSessions: { increment: quantity },
        },
      });

      // 6. Create immutable BenefitDebitLog (status: RESERVED)
      const debitLog = await tx.benefitDebitLog.create({
        data: {
          organizationId,
          agreementId: dto.agreementId,
          poolId: dto.poolId,
          eligibilityId: dto.eligibilityId,
          branchId: dto.branchId,
          appointmentId: dto.appointmentId,
          patientId: dto.patientId,
          userId,
          transactionType: BenefitDebitType.SESSION_BOOKING,
          sessionQuantity: quantity,
          status: BenefitDebitStatus.RESERVED,
          reason: dto.reason || 'Benefit session reservation',
          metadata: (dto.metadata as Prisma.InputJsonValue) || {},
        },
      });

      return {
        debitLog,
        poolUpdated: {
          poolId: pool.id,
          totalSessions: pool.total_sessions,
          consumedSessions: pool.consumed_sessions,
          reservedSessions: pool.reserved_sessions + quantity,
          availableSessions:
            pool.total_sessions -
            (pool.consumed_sessions + pool.reserved_sessions + quantity),
        },
        eligibilityUpdated: {
          eligibilityId: eligibility.id,
          maxSessionsAllowed: eligibility.max_sessions_allowed,
          consumedSessions: eligibility.consumed_sessions,
          reservedSessions: eligibility.reserved_sessions + quantity,
          availableSessions:
            eligibility.max_sessions_allowed -
            (eligibility.consumed_sessions +
              eligibility.reserved_sessions +
              quantity),
        },
      };
    });
  }

  /**
   * Confirms a reserved benefit session upon completion of consultation.
   */
  async confirmBenefitSession(
    organizationId: string,
    debitLogId: string,
    dto?: ConfirmBenefitSessionDto,
    userId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const debitLog = await tx.benefitDebitLog.findFirst({
        where: { id: debitLogId, organizationId },
      });

      if (!debitLog) {
        throw new NotFoundException('Benefit debit log not found');
      }

      if (debitLog.status !== BenefitDebitStatus.RESERVED) {
        throw new BadRequestException(
          `Cannot confirm debit log in status "${debitLog.status}". Only RESERVED logs can be confirmed.`,
        );
      }

      const quantity = debitLog.sessionQuantity;

      // Lock Pool
      await tx.$queryRaw`
        SELECT id FROM benefit_pools
        WHERE id = ${debitLog.poolId}::uuid
        FOR UPDATE
      `;

      // Update Pool: decrement reserved, increment consumed
      await tx.benefitPool.update({
        where: { id: debitLog.poolId },
        data: {
          reservedSessions: { decrement: quantity },
          consumedSessions: { increment: quantity },
        },
      });

      // Lock & Update Eligibility if present
      if (debitLog.eligibilityId) {
        await tx.$queryRaw`
          SELECT id FROM employee_eligibilities
          WHERE id = ${debitLog.eligibilityId}::uuid
          FOR UPDATE
        `;

        await tx.employeeEligibility.update({
          where: { id: debitLog.eligibilityId },
          data: {
            reservedSessions: { decrement: quantity },
            consumedSessions: { increment: quantity },
          },
        });
      }

      // Update DebitLog to CONFIRMED
      const updatedLog = await tx.benefitDebitLog.update({
        where: { id: debitLogId },
        data: {
          status: BenefitDebitStatus.CONFIRMED,
          ...(userId && { userId }),
          ...(dto?.reason && { reason: dto.reason }),
          ...(dto?.metadata && {
            metadata: {
              ...(typeof debitLog.metadata === 'object' &&
              debitLog.metadata !== null
                ? (debitLog.metadata as Record<string, any>)
                : {}),
              ...dto.metadata,
              confirmedAt: new Date().toISOString(),
            },
          }),
        },
      });

      return updatedLog;
    });
  }

  /**
   * Releases a RESERVED session or refunds a CONFIRMED session.
   */
  async releaseOrRefundBenefitSession(
    organizationId: string,
    debitLogId: string,
    dto: ReleaseBenefitSessionDto,
    userId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const debitLog = await tx.benefitDebitLog.findFirst({
        where: { id: debitLogId, organizationId },
      });

      if (!debitLog) {
        throw new NotFoundException('Benefit debit log not found');
      }

      const quantity = debitLog.sessionQuantity;

      if (debitLog.status === BenefitDebitStatus.RESERVED) {
        // Lock Pool
        await tx.$queryRaw`
          SELECT id FROM benefit_pools
          WHERE id = ${debitLog.poolId}::uuid
          FOR UPDATE
        `;

        await tx.benefitPool.update({
          where: { id: debitLog.poolId },
          data: {
            reservedSessions: { decrement: quantity },
          },
        });

        if (debitLog.eligibilityId) {
          await tx.$queryRaw`
            SELECT id FROM employee_eligibilities
            WHERE id = ${debitLog.eligibilityId}::uuid
            FOR UPDATE
          `;

          await tx.employeeEligibility.update({
            where: { id: debitLog.eligibilityId },
            data: {
              reservedSessions: { decrement: quantity },
            },
          });
        }

        return tx.benefitDebitLog.update({
          where: { id: debitLogId },
          data: {
            status: BenefitDebitStatus.RELEASED,
            reason: dto.reason,
            ...(userId && { userId }),
            metadata: {
              ...(typeof debitLog.metadata === 'object' &&
              debitLog.metadata !== null
                ? (debitLog.metadata as Record<string, any>)
                : {}),
              ...(dto.metadata || {}),
              releasedAt: new Date().toISOString(),
            },
          },
        });
      } else if (debitLog.status === BenefitDebitStatus.CONFIRMED) {
        // Lock Pool
        await tx.$queryRaw`
          SELECT id FROM benefit_pools
          WHERE id = ${debitLog.poolId}::uuid
          FOR UPDATE
        `;

        await tx.benefitPool.update({
          where: { id: debitLog.poolId },
          data: {
            consumedSessions: { decrement: quantity },
          },
        });

        if (debitLog.eligibilityId) {
          await tx.$queryRaw`
            SELECT id FROM employee_eligibilities
            WHERE id = ${debitLog.eligibilityId}::uuid
            FOR UPDATE
          `;

          await tx.employeeEligibility.update({
            where: { id: debitLog.eligibilityId },
            data: {
              consumedSessions: { decrement: quantity },
            },
          });
        }

        return tx.benefitDebitLog.update({
          where: { id: debitLogId },
          data: {
            status: BenefitDebitStatus.REFUNDED,
            reason: dto.reason,
            transactionType: BenefitDebitType.SESSION_CANCEL_REFUND,
            ...(userId && { userId }),
            metadata: {
              ...(typeof debitLog.metadata === 'object' &&
              debitLog.metadata !== null
                ? (debitLog.metadata as Record<string, any>)
                : {}),
              ...(dto.metadata || {}),
              refundedAt: new Date().toISOString(),
            },
          },
        });
      } else {
        throw new BadRequestException(
          `Cannot release or refund a debit log in status "${debitLog.status}".`,
        );
      }
    });
  }

  /**
   * Lists debit ledger logs for audit and tracking.
   */
  async getDebitLogs(
    organizationId: string,
    filters?: {
      agreementId?: string;
      poolId?: string;
      eligibilityId?: string;
      appointmentId?: string;
      status?: BenefitDebitStatus;
    },
  ) {
    return this.prisma.benefitDebitLog.findMany({
      where: {
        organizationId,
        ...(filters?.agreementId && { agreementId: filters.agreementId }),
        ...(filters?.poolId && { poolId: filters.poolId }),
        ...(filters?.eligibilityId && { eligibilityId: filters.eligibilityId }),
        ...(filters?.appointmentId && { appointmentId: filters.appointmentId }),
        ...(filters?.status && { status: filters.status }),
      },
      include: {
        agreement: {
          select: { id: true, code: true, title: true },
        },
        pool: {
          select: { id: true, name: true },
        },
        eligibility: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            employeeNumber: true,
          },
        },
        branch: {
          select: { id: true, name: true, code: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
