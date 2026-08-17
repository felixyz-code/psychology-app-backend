import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BenefitPoolStatus, PaefAgreementStatus } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CreateBenefitPoolDto } from '../dto/create-benefit-pool.dto';
import { UpdateBenefitPoolDto } from '../dto/update-benefit-pool.dto';

@Injectable()
export class BenefitPoolsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    organizationId: string,
    agreementId: string,
    dto: CreateBenefitPoolDto,
  ) {
    const agreement = await this.prisma.paefAgreement.findFirst({
      where: { id: agreementId, organizationId },
    });

    if (!agreement) {
      throw new NotFoundException('PAEF agreement not found');
    }

    if (agreement.status === PaefAgreementStatus.TERMINATED) {
      throw new BadRequestException(
        'Cannot add pools to a terminated agreement',
      );
    }

    const validFrom = new Date(dto.validFrom);
    const validUntil = new Date(dto.validUntil);

    if (validUntil <= validFrom) {
      throw new BadRequestException(
        'validUntil must be greater than validFrom',
      );
    }

    return this.prisma.benefitPool.create({
      data: {
        organizationId,
        agreementId,
        name: dto.name,
        totalSessions: dto.totalSessions,
        consumedSessions: 0,
        reservedSessions: 0,
        status: dto.status || BenefitPoolStatus.ACTIVE,
        validFrom,
        validUntil,
      },
    });
  }

  async findAllByAgreement(organizationId: string, agreementId: string) {
    const pools = await this.prisma.benefitPool.findMany({
      where: { organizationId, agreementId },
      orderBy: { validFrom: 'desc' },
    });

    return pools.map((pool) => ({
      ...pool,
      availableSessions: Math.max(
        0,
        pool.totalSessions - pool.consumedSessions - pool.reservedSessions,
      ),
      utilizationPercentage:
        pool.totalSessions > 0
          ? Number(
              (
                ((pool.consumedSessions + pool.reservedSessions) /
                  pool.totalSessions) *
                100
              ).toFixed(1),
            )
          : 0,
    }));
  }

  async findOne(organizationId: string, id: string) {
    const pool = await this.prisma.benefitPool.findFirst({
      where: { id, organizationId },
      include: {
        agreement: {
          select: {
            id: true,
            code: true,
            title: true,
            status: true,
            corporateClient: {
              select: { id: true, name: true },
            },
          },
        },
        debitLogs: {
          take: 50,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!pool) {
      throw new NotFoundException('Benefit pool not found');
    }

    const availableSessions = Math.max(
      0,
      pool.totalSessions - pool.consumedSessions - pool.reservedSessions,
    );

    return {
      ...pool,
      availableSessions,
      utilizationPercentage:
        pool.totalSessions > 0
          ? Number(
              (
                ((pool.consumedSessions + pool.reservedSessions) /
                  pool.totalSessions) *
                100
              ).toFixed(1),
            )
          : 0,
    };
  }

  async update(organizationId: string, id: string, dto: UpdateBenefitPoolDto) {
    const current = await this.findOne(organizationId, id);

    if (dto.totalSessions !== undefined) {
      const activeCommitment =
        current.consumedSessions + current.reservedSessions;
      if (dto.totalSessions < activeCommitment) {
        throw new BadRequestException(
          `totalSessions cannot be less than current consumed + reserved sessions (${activeCommitment})`,
        );
      }
    }

    return this.prisma.benefitPool.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.totalSessions !== undefined && {
          totalSessions: dto.totalSessions,
        }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.validFrom !== undefined && {
          validFrom: new Date(dto.validFrom),
        }),
        ...(dto.validUntil !== undefined && {
          validUntil: new Date(dto.validUntil),
        }),
      },
    });
  }
}
