import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmployeeEligibilityStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CreateEmployeeEligibilityDto } from '../dto/create-employee-eligibility.dto';
import { BatchEmployeeEligibilityDto } from '../dto/batch-employee-eligibility.dto';
import { UpdateEmployeeEligibilityDto } from '../dto/update-employee-eligibility.dto';
import { CheckEligibilityDto } from '../dto/benefit-debit.dto';

@Injectable()
export class EmployeeEligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    organizationId: string,
    agreementId: string,
    dto: CreateEmployeeEligibilityDto,
  ) {
    const agreement = await this.prisma.paefAgreement.findFirst({
      where: { id: agreementId, organizationId },
    });

    if (!agreement) {
      throw new NotFoundException('PAEF agreement not found');
    }

    const normalizedEmail = dto.email.trim().toLowerCase();

    const existing = await this.prisma.employeeEligibility.findUnique({
      where: {
        agreementId_email: {
          agreementId,
          email: normalizedEmail,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Employee with email "${normalizedEmail}" is already registered in this agreement.`,
      );
    }

    const maxSessionsAllowed =
      dto.maxSessionsAllowed || agreement.defaultMaxSessionsPerEmployee;

    return this.prisma.employeeEligibility.create({
      data: {
        organizationId,
        agreementId,
        email: normalizedEmail,
        employeeNumber: dto.employeeNumber,
        nationalId: dto.nationalId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        department: dto.department,
        maxSessionsAllowed,
        consumedSessions: 0,
        reservedSessions: 0,
        status: dto.status || EmployeeEligibilityStatus.ACTIVE,
      },
    });
  }

  async batchCreate(
    organizationId: string,
    agreementId: string,
    dto: BatchEmployeeEligibilityDto,
  ) {
    const agreement = await this.prisma.paefAgreement.findFirst({
      where: { id: agreementId, organizationId },
    });

    if (!agreement) {
      throw new NotFoundException('PAEF agreement not found');
    }

    const results = {
      importedCount: 0,
      skippedCount: 0,
      errors: [] as string[],
    };

    for (const item of dto.employees) {
      const normalizedEmail = item.email.trim().toLowerCase();
      try {
        const existing = await this.prisma.employeeEligibility.findUnique({
          where: {
            agreementId_email: {
              agreementId,
              email: normalizedEmail,
            },
          },
        });

        if (existing) {
          results.skippedCount++;
          continue;
        }

        const maxSessionsAllowed =
          item.maxSessionsAllowed || agreement.defaultMaxSessionsPerEmployee;

        await this.prisma.employeeEligibility.create({
          data: {
            organizationId,
            agreementId,
            email: normalizedEmail,
            employeeNumber: item.employeeNumber,
            nationalId: item.nationalId,
            firstName: item.firstName,
            lastName: item.lastName,
            department: item.department,
            maxSessionsAllowed,
            consumedSessions: 0,
            reservedSessions: 0,
            status: item.status || EmployeeEligibilityStatus.ACTIVE,
          },
        });

        results.importedCount++;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        results.errors.push(`Error on ${normalizedEmail}: ${errorMsg}`);
      }
    }

    return results;
  }

  async findAllByAgreement(
    organizationId: string,
    agreementId: string,
    options?: { search?: string; department?: string },
  ) {
    const where: Prisma.EmployeeEligibilityWhereInput = {
      organizationId,
      agreementId,
    };

    if (options?.department) {
      where.department = options.department;
    }

    if (options?.search) {
      const s = options.search.trim();
      where.OR = [
        { email: { contains: s, mode: 'insensitive' } },
        { firstName: { contains: s, mode: 'insensitive' } },
        { lastName: { contains: s, mode: 'insensitive' } },
        { employeeNumber: { contains: s, mode: 'insensitive' } },
      ];
    }

    const records = await this.prisma.employeeEligibility.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => ({
      ...r,
      availableSessions: Math.max(
        0,
        r.maxSessionsAllowed - r.consumedSessions - r.reservedSessions,
      ),
    }));
  }

  async findOne(organizationId: string, id: string) {
    const record = await this.prisma.employeeEligibility.findFirst({
      where: { id, organizationId },
      include: {
        agreement: {
          include: {
            corporateClient: true,
          },
        },
        debitLogs: {
          take: 50,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!record) {
      throw new NotFoundException('Employee eligibility record not found');
    }

    return {
      ...record,
      availableSessions: Math.max(
        0,
        record.maxSessionsAllowed -
          record.consumedSessions -
          record.reservedSessions,
      ),
    };
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdateEmployeeEligibilityDto,
  ) {
    const current = await this.findOne(organizationId, id);

    if (dto.maxSessionsAllowed !== undefined) {
      const activeUsage = current.consumedSessions + current.reservedSessions;
      if (dto.maxSessionsAllowed < activeUsage) {
        throw new BadRequestException(
          `maxSessionsAllowed cannot be less than current active usage (${activeUsage})`,
        );
      }
    }

    return this.prisma.employeeEligibility.update({
      where: { id },
      data: {
        ...(dto.employeeNumber !== undefined && {
          employeeNumber: dto.employeeNumber,
        }),
        ...(dto.nationalId !== undefined && { nationalId: dto.nationalId }),
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.department !== undefined && { department: dto.department }),
        ...(dto.maxSessionsAllowed !== undefined && {
          maxSessionsAllowed: dto.maxSessionsAllowed,
        }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
    });
  }

  async remove(organizationId: string, id: string) {
    await this.findOne(organizationId, id);

    return this.prisma.employeeEligibility.update({
      where: { id },
      data: { status: EmployeeEligibilityStatus.REVOKED },
    });
  }

  async checkEligibility(organizationId: string, dto: CheckEligibilityDto) {
    const agreement = await this.prisma.paefAgreement.findFirst({
      where: { id: dto.agreementId, organizationId },
      include: {
        corporateClient: true,
        benefitPools: {
          where: {
            status: 'ACTIVE',
            validFrom: { lte: new Date() },
            validUntil: { gte: new Date() },
          },
        },
      },
    });

    if (!agreement) {
      return {
        isEligible: false,
        reason: 'AGREEMENT_NOT_FOUND',
        message: 'PAEF Agreement not found or not active for this tenant.',
      };
    }

    if (agreement.status !== 'ACTIVE') {
      return {
        isEligible: false,
        reason: 'AGREEMENT_INACTIVE',
        message: `Agreement is currently ${agreement.status}.`,
      };
    }

    const now = new Date();
    if (agreement.validFrom > now || agreement.validUntil < now) {
      return {
        isEligible: false,
        reason: 'AGREEMENT_EXPIRED',
        message: 'Agreement is outside its valid date range.',
      };
    }

    // Branch check
    if (!agreement.isMultiBranch && dto.branchId) {
      if (!agreement.allowedBranchIds.includes(dto.branchId)) {
        return {
          isEligible: false,
          reason: 'BRANCH_NOT_ALLOWED',
          message: 'This agreement is not authorized for the requested branch.',
        };
      }
    }

    const normalizedEmail = dto.email.trim().toLowerCase();

    // 1. Search for explicit eligibility record
    let eligibility = await this.prisma.employeeEligibility.findUnique({
      where: {
        agreementId_email: {
          agreementId: dto.agreementId,
          email: normalizedEmail,
        },
      },
    });

    // 2. If no explicit roster entry, check if domain is whitelisted in corporate client
    if (!eligibility) {
      const emailDomain = `@${normalizedEmail.split('@')[1]}`;
      const domainMatch = agreement.corporateClient.domainWhitelist.some(
        (domain) => domain.toLowerCase() === emailDomain.toLowerCase(),
      );

      if (domainMatch) {
        // Auto-provision eligibility based on corporate domain policy
        eligibility = await this.prisma.employeeEligibility.create({
          data: {
            organizationId,
            agreementId: agreement.id,
            email: normalizedEmail,
            employeeNumber: dto.employeeNumber,
            maxSessionsAllowed: agreement.defaultMaxSessionsPerEmployee,
            consumedSessions: 0,
            reservedSessions: 0,
            status: EmployeeEligibilityStatus.ACTIVE,
          },
        });
      }
    }

    if (!eligibility) {
      return {
        isEligible: false,
        reason: 'NOT_IN_ROSTER',
        message:
          'Employee is not in the authorized eligibility roster and email domain is not whitelisted.',
      };
    }

    if (eligibility.status !== EmployeeEligibilityStatus.ACTIVE) {
      return {
        isEligible: false,
        reason: 'ELIGIBILITY_REVOKED',
        message: `Employee eligibility is ${eligibility.status}.`,
      };
    }

    const employeeAvailable =
      eligibility.maxSessionsAllowed -
      eligibility.consumedSessions -
      eligibility.reservedSessions;

    if (employeeAvailable <= 0) {
      return {
        isEligible: false,
        reason: 'EMPLOYEE_QUOTA_EXHAUSTED',
        message: 'Employee has exhausted their maximum allotted sessions.',
        eligibilityId: eligibility.id,
        maxSessionsAllowed: eligibility.maxSessionsAllowed,
        consumedSessions: eligibility.consumedSessions,
        reservedSessions: eligibility.reservedSessions,
      };
    }

    // Check pool availability
    const activePools = agreement.benefitPools.map((p) => ({
      id: p.id,
      name: p.name,
      totalSessions: p.totalSessions,
      consumedSessions: p.consumedSessions,
      reservedSessions: p.reservedSessions,
      availableSessions: Math.max(
        0,
        p.totalSessions - p.consumedSessions - p.reservedSessions,
      ),
    }));

    const totalPoolAvailable = activePools.reduce(
      (sum, p) => sum + p.availableSessions,
      0,
    );

    if (totalPoolAvailable <= 0) {
      return {
        isEligible: false,
        reason: 'POOL_EXHAUSTED',
        message:
          'No available sessions remain in active agreement benefit pools.',
        eligibilityId: eligibility.id,
        pools: activePools,
      };
    }

    return {
      isEligible: true,
      reason: 'ELIGIBLE',
      message: 'Employee is eligible for corporate sponsored benefit sessions.',
      eligibility: {
        id: eligibility.id,
        email: eligibility.email,
        employeeNumber: eligibility.employeeNumber,
        firstName: eligibility.firstName,
        lastName: eligibility.lastName,
        department: eligibility.department,
        maxSessionsAllowed: eligibility.maxSessionsAllowed,
        consumedSessions: eligibility.consumedSessions,
        reservedSessions: eligibility.reservedSessions,
        availableSessions: employeeAvailable,
      },
      agreement: {
        id: agreement.id,
        code: agreement.code,
        title: agreement.title,
        corporateClient: {
          id: agreement.corporateClient.id,
          name: agreement.corporateClient.name,
        },
      },
      availablePools: activePools.filter((p) => p.availableSessions > 0),
    };
  }
}
