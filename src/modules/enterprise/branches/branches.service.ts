import {
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { EntitlementKey } from '../../../entitlements/entitlements.constants';
import { EntitlementsService } from '../../../entitlements/entitlements.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { AssignUserBranchDto } from './dto/assign-user-branch.dto';

@Injectable()
export class BranchesService {
  private readonly logger = new Logger(BranchesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlementsService: EntitlementsService,
  ) {}

  /**
   * Creates a new branch for the organization, checking plan quotas and code uniqueness.
   */
  async create(organizationId: string, dto: CreateBranchDto) {
    // 1. Quota verification via EntitlementsService (throws PlanLimitExceededException / 403 on limit)
    await this.entitlementsService.checkNumericQuota(
      organizationId,
      EntitlementKey.MAX_BRANCHES,
      { proposedIncrement: 1, throwOnExceeded: true },
    );

    const normalizedCode = dto.code.trim().toUpperCase();

    // 2. Uniqueness verification within active/non-deleted branches of the organization
    const existing = await this.prisma.branch.findFirst({
      where: {
        organizationId,
        code: normalizedCode,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ConflictException({
        statusCode: HttpStatus.CONFLICT,
        code: 'BRANCH_CODE_EXISTS',
        message: `A branch with code '${normalizedCode}' already exists in this organization`,
      });
    }

    // 3. Persist branch
    const branch = await this.prisma.branch.create({
      data: {
        organizationId,
        name: dto.name.trim(),
        code: normalizedCode,
        address: dto.address?.trim() ?? null,
        phone: dto.phone?.trim() ?? null,
        timezone: dto.timezone?.trim() ?? 'UTC',
        isActive: dto.isActive ?? true,
      },
    });

    this.logger.log({
      event: 'branch_created',
      organizationId,
      branchId: branch.id,
      code: branch.code,
    });

    return branch;
  }

  /**
   * Lists all non-deleted branches for an organization.
   */
  async findAll(
    organizationId: string,
    options?: { includeInactive?: boolean },
  ) {
    return this.prisma.branch.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(options?.includeInactive ? {} : { isActive: true }),
      },
      include: {
        _count: {
          select: { userAccesses: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Retrieves a single branch by ID within an organization.
   */
  async findOne(organizationId: string, branchId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: {
        id: branchId,
        organizationId,
        deletedAt: null,
      },
      include: {
        userAccesses: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
            },
          },
        },
      },
    });

    if (!branch) {
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Branch not found in this organization',
      });
    }

    return branch;
  }

  /**
   * Updates branch details, enforcing unique code constraint across the organization.
   */
  async update(organizationId: string, branchId: string, dto: UpdateBranchDto) {
    const branch = await this.findOne(organizationId, branchId);

    const normalizedCode = dto.code ? dto.code.trim().toUpperCase() : undefined;

    if (normalizedCode && normalizedCode !== branch.code) {
      const duplicate = await this.prisma.branch.findFirst({
        where: {
          organizationId,
          code: normalizedCode,
          id: { not: branchId },
          deletedAt: null,
        },
      });

      if (duplicate) {
        throw new ConflictException({
          statusCode: HttpStatus.CONFLICT,
          code: 'BRANCH_CODE_EXISTS',
          message: `A branch with code '${normalizedCode}' already exists in this organization`,
        });
      }
    }

    const updated = await this.prisma.branch.update({
      where: { id: branchId },
      data: {
        name: dto.name?.trim(),
        code: normalizedCode,
        address:
          dto.address !== undefined ? (dto.address?.trim() ?? null) : undefined,
        phone:
          dto.phone !== undefined ? (dto.phone?.trim() ?? null) : undefined,
        timezone: dto.timezone?.trim(),
        isActive: dto.isActive,
      },
    });

    this.logger.log({
      event: 'branch_updated',
      organizationId,
      branchId: updated.id,
      code: updated.code,
    });

    return updated;
  }

  /**
   * Soft-deletes a branch. Protects the only active branch from deletion.
   */
  async remove(organizationId: string, branchId: string) {
    const branch = await this.findOne(organizationId, branchId);

    const activeCount = await this.prisma.branch.count({
      where: {
        organizationId,
        deletedAt: null,
        isActive: true,
      },
    });

    if (branch.isActive && activeCount <= 1) {
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        code: 'CANNOT_DELETE_ONLY_BRANCH',
        message: 'Cannot delete the only active branch of the organization',
      });
    }

    const deleted = await this.prisma.branch.update({
      where: { id: branchId },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });

    this.logger.log({
      event: 'branch_deleted',
      organizationId,
      branchId,
    });

    return deleted;
  }

  /**
   * Assigns a user to a branch. Optionally sets as primary branch.
   */
  async assignUser(
    organizationId: string,
    dto: AssignUserBranchDto & { branchId: string },
  ) {
    await this.findOne(organizationId, dto.branchId);

    // Validate active membership
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        organizationId,
        userId: dto.userId,
        status: MembershipStatus.ACTIVE,
      },
    });

    if (!membership) {
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Active organization membership for user not found',
      });
    }

    const isPrimary = dto.isPrimary ?? false;

    if (isPrimary) {
      // Clear previous primary branch flag for this user in the same organization
      await this.prisma.userBranchAccess.updateMany({
        where: {
          organizationId,
          userId: dto.userId,
          isPrimary: true,
        },
        data: {
          isPrimary: false,
        },
      });
    }

    const access = await this.prisma.userBranchAccess.upsert({
      where: {
        userId_branchId: {
          userId: dto.userId,
          branchId: dto.branchId,
        },
      },
      update: {
        isPrimary,
      },
      create: {
        organizationId,
        userId: dto.userId,
        branchId: dto.branchId,
        isPrimary,
      },
      include: {
        branch: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    this.logger.log({
      event: 'user_branch_assigned',
      organizationId,
      userId: dto.userId,
      branchId: dto.branchId,
      isPrimary,
    });

    return access;
  }

  /**
   * Removes user branch access assignment.
   */
  async removeUserAccess(
    organizationId: string,
    branchId: string,
    userId: string,
  ) {
    await this.findOne(organizationId, branchId);

    const access = await this.prisma.userBranchAccess.findUnique({
      where: {
        userId_branchId: {
          userId,
          branchId,
        },
      },
    });

    if (!access || access.organizationId !== organizationId) {
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        code: 'RESOURCE_NOT_FOUND',
        message: 'User branch access record not found',
      });
    }

    await this.prisma.userBranchAccess.delete({
      where: {
        userId_branchId: {
          userId,
          branchId,
        },
      },
    });

    this.logger.log({
      event: 'user_branch_unassigned',
      organizationId,
      userId,
      branchId,
    });

    return {
      success: true,
      message: 'User branch access removed successfully',
    };
  }

  /**
   * Retrieves all branches assigned to a specific user within the organization.
   */
  async getUserBranches(organizationId: string, userId: string) {
    return this.prisma.userBranchAccess.findMany({
      where: {
        organizationId,
        userId,
        branch: {
          deletedAt: null,
        },
      },
      include: {
        branch: true,
      },
      orderBy: { isPrimary: 'desc' },
    });
  }

  /**
   * Retrieves all users assigned to a branch.
   */
  async getBranchUsers(organizationId: string, branchId: string) {
    await this.findOne(organizationId, branchId);

    return this.prisma.userBranchAccess.findMany({
      where: {
        organizationId,
        branchId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
