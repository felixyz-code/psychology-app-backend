import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaefAgreementStatus } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CreatePaefAgreementDto } from '../dto/create-paef-agreement.dto';
import { UpdatePaefAgreementDto } from '../dto/update-paef-agreement.dto';

@Injectable()
export class PaefAgreementsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, dto: CreatePaefAgreementDto) {
    const validFrom = new Date(dto.validFrom);
    const validUntil = new Date(dto.validUntil);

    if (validUntil <= validFrom) {
      throw new BadRequestException(
        'validUntil must be greater than validFrom',
      );
    }

    // Verify corporate client exists and belongs to tenant
    const client = await this.prisma.corporateClient.findFirst({
      where: { id: dto.corporateClientId, organizationId, isActive: true },
    });

    if (!client) {
      throw new NotFoundException('Active corporate client not found');
    }

    // Verify code uniqueness per organization
    const existingCode = await this.prisma.paefAgreement.findUnique({
      where: {
        organizationId_code: {
          organizationId,
          code: dto.code,
        },
      },
    });

    if (existingCode) {
      throw new ConflictException(
        `Agreement with code "${dto.code}" already exists in this organization.`,
      );
    }

    // If specific branches are configured, verify they exist
    if (
      dto.isMultiBranch === false &&
      dto.allowedBranchIds &&
      dto.allowedBranchIds.length > 0
    ) {
      const branches = await this.prisma.branch.findMany({
        where: {
          id: { in: dto.allowedBranchIds },
          organizationId,
          deletedAt: null,
        },
      });

      if (branches.length !== dto.allowedBranchIds.length) {
        throw new BadRequestException(
          'One or more specified branch IDs are invalid or inactive',
        );
      }
    }

    return this.prisma.paefAgreement.create({
      data: {
        organizationId,
        corporateClientId: dto.corporateClientId,
        code: dto.code,
        title: dto.title,
        description: dto.description,
        status: dto.status || PaefAgreementStatus.ACTIVE,
        isMultiBranch:
          dto.isMultiBranch !== undefined ? dto.isMultiBranch : true,
        allowedBranchIds: dto.allowedBranchIds || [],
        defaultMaxSessionsPerEmployee: dto.defaultMaxSessionsPerEmployee || 5,
        validFrom,
        validUntil,
      },
      include: {
        corporateClient: {
          select: {
            id: true,
            name: true,
            commercialName: true,
            domainWhitelist: true,
          },
        },
        benefitPools: true,
      },
    });
  }

  async findAll(
    organizationId: string,
    filters?: {
      corporateClientId?: string;
      status?: PaefAgreementStatus;
    },
  ) {
    return this.prisma.paefAgreement.findMany({
      where: {
        organizationId,
        ...(filters?.corporateClientId && {
          corporateClientId: filters.corporateClientId,
        }),
        ...(filters?.status && { status: filters.status }),
      },
      include: {
        corporateClient: {
          select: { id: true, name: true, commercialName: true },
        },
        benefitPools: true,
        _count: {
          select: {
            employeeEligibilities: true,
            debitLogs: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(organizationId: string, id: string) {
    const agreement = await this.prisma.paefAgreement.findFirst({
      where: { id, organizationId },
      include: {
        corporateClient: true,
        benefitPools: {
          orderBy: { validFrom: 'desc' },
        },
        employeeEligibilities: {
          take: 100,
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            employeeEligibilities: true,
            debitLogs: true,
          },
        },
      },
    });

    if (!agreement) {
      throw new NotFoundException('PAEF agreement not found');
    }

    return agreement;
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdatePaefAgreementDto,
  ) {
    const current = await this.findOne(organizationId, id);

    if (dto.validFrom || dto.validUntil) {
      const validFrom = dto.validFrom
        ? new Date(dto.validFrom)
        : current.validFrom;
      const validUntil = dto.validUntil
        ? new Date(dto.validUntil)
        : current.validUntil;

      if (validUntil <= validFrom) {
        throw new BadRequestException(
          'validUntil must be greater than validFrom',
        );
      }
    }

    if (dto.code && dto.code !== current.code) {
      const codeConflict = await this.prisma.paefAgreement.findUnique({
        where: {
          organizationId_code: {
            organizationId,
            code: dto.code,
          },
        },
      });

      if (codeConflict) {
        throw new ConflictException(
          `Agreement with code "${dto.code}" already exists in this organization.`,
        );
      }
    }

    return this.prisma.paefAgreement.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.isMultiBranch !== undefined && {
          isMultiBranch: dto.isMultiBranch,
        }),
        ...(dto.allowedBranchIds !== undefined && {
          allowedBranchIds: dto.allowedBranchIds,
        }),
        ...(dto.defaultMaxSessionsPerEmployee !== undefined && {
          defaultMaxSessionsPerEmployee: dto.defaultMaxSessionsPerEmployee,
        }),
        ...(dto.validFrom !== undefined && {
          validFrom: new Date(dto.validFrom),
        }),
        ...(dto.validUntil !== undefined && {
          validUntil: new Date(dto.validUntil),
        }),
      },
      include: {
        corporateClient: true,
        benefitPools: true,
      },
    });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);

    return this.prisma.paefAgreement.update({
      where: { id },
      data: { status: PaefAgreementStatus.TERMINATED },
    });
  }
}
