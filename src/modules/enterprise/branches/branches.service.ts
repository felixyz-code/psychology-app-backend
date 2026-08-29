import {
  BadRequestException,
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
import { AssignProfessionalBranchDto } from './dto/assign-professional-branch.dto';
import { UpdateProfessionalScheduleDto } from './dto/update-professional-schedule.dto';
import { ScheduleSlotDto } from './dto/schedule-slot.dto';

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

  /**
   * Retrieves all professionals assigned to a branch along with their weekly schedule slots.
   */
  async getBranchProfessionals(organizationId: string, branchId: string) {
    await this.findOne(organizationId, branchId);

    const accesses = await this.prisma.userBranchAccess.findMany({
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

    const schedules = await this.prisma.branchProfessionalSchedule.findMany({
      where: {
        organizationId,
        branchId,
        isActive: true,
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });

    const schedulesByUser = new Map<string, typeof schedules>();
    for (const schedule of schedules) {
      const list = schedulesByUser.get(schedule.userId) ?? [];
      list.push(schedule);
      schedulesByUser.set(schedule.userId, list);
    }

    return accesses.map((access) => ({
      id: access.id,
      organizationId: access.organizationId,
      branchId: access.branchId,
      userId: access.userId,
      isPrimary: access.isPrimary,
      createdAt: access.createdAt,
      user: access.user,
      schedules: schedulesByUser.get(access.userId) ?? [],
    }));
  }

  /**
   * Assigns a professional to a branch with optional initial weekly schedule slots.
   */
  async assignProfessionalWithSchedule(
    organizationId: string,
    branchId: string,
    dto: AssignProfessionalBranchDto,
  ) {
    await this.findOne(organizationId, branchId);

    if (dto.schedules && dto.schedules.length > 0) {
      this.validateScheduleSlots(dto.schedules);
    }

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

    return this.prisma.$transaction(async (tx) => {
      if (isPrimary) {
        await tx.userBranchAccess.updateMany({
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

      const access = await tx.userBranchAccess.upsert({
        where: {
          userId_branchId: {
            userId: dto.userId,
            branchId,
          },
        },
        update: {
          isPrimary,
        },
        create: {
          organizationId,
          userId: dto.userId,
          branchId,
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

      let updatedSchedules: any[] = [];
      if (dto.schedules) {
        await tx.branchProfessionalSchedule.deleteMany({
          where: {
            organizationId,
            branchId,
            userId: dto.userId,
          },
        });

        if (dto.schedules.length > 0) {
          await tx.branchProfessionalSchedule.createMany({
            data: dto.schedules.map((slot) => ({
              organizationId,
              branchId,
              userId: dto.userId,
              dayOfWeek: slot.dayOfWeek,
              startTime: slot.startTime,
              endTime: slot.endTime,
              durationSlotMinutes: slot.durationSlotMinutes ?? 60,
              isActive: slot.isActive ?? true,
            })),
          });

          updatedSchedules = await tx.branchProfessionalSchedule.findMany({
            where: {
              organizationId,
              branchId,
              userId: dto.userId,
            },
            orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
          });
        }
      } else {
        updatedSchedules = await tx.branchProfessionalSchedule.findMany({
          where: {
            organizationId,
            branchId,
            userId: dto.userId,
          },
          orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
        });
      }

      this.logger.log({
        event: 'professional_branch_assigned',
        organizationId,
        userId: dto.userId,
        branchId,
        isPrimary,
        slotsCount: updatedSchedules.length,
      });

      return {
        ...access,
        schedules: updatedSchedules,
      };
    });
  }

  /**
   * Updates weekly in-person schedule slots for an assigned professional in a branch.
   */
  async updateProfessionalSchedule(
    organizationId: string,
    branchId: string,
    userId: string,
    dto: UpdateProfessionalScheduleDto,
    requestingUser?: { id: string; role?: string; isSuperAdmin?: boolean },
  ) {
    await this.findOne(organizationId, branchId);

    // Verify user is assigned to branch
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
        message: 'Professional is not assigned to this branch',
      });
    }

    // Permission check: Self or Admin/Owner
    if (requestingUser) {
      const isSelf = requestingUser.id === userId;
      const isAdminOrOwner =
        requestingUser.role === 'ADMIN' ||
        requestingUser.role === 'OWNER' ||
        requestingUser.isSuperAdmin === true;

      if (!isSelf && !isAdminOrOwner) {
        throw new ForbiddenException({
          statusCode: HttpStatus.FORBIDDEN,
          code: 'FORBIDDEN_RESOURCE',
          message:
            'You do not have permission to update schedules for this professional',
        });
      }
    }

    if (dto.schedules && dto.schedules.length > 0) {
      this.validateScheduleSlots(dto.schedules);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.branchProfessionalSchedule.deleteMany({
        where: {
          organizationId,
          branchId,
          userId,
        },
      });

      if (dto.schedules && dto.schedules.length > 0) {
        await tx.branchProfessionalSchedule.createMany({
          data: dto.schedules.map((slot) => ({
            organizationId,
            branchId,
            userId,
            dayOfWeek: slot.dayOfWeek,
            startTime: slot.startTime,
            endTime: slot.endTime,
            durationSlotMinutes: slot.durationSlotMinutes ?? 60,
            isActive: slot.isActive ?? true,
          })),
        });
      }

      const updatedSchedules = await tx.branchProfessionalSchedule.findMany({
        where: {
          organizationId,
          branchId,
          userId,
        },
        orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
      });

      this.logger.log({
        event: 'professional_schedule_updated',
        organizationId,
        userId,
        branchId,
        slotsCount: updatedSchedules.length,
      });

      return {
        userId,
        branchId,
        organizationId,
        schedules: updatedSchedules,
      };
    });
  }

  /**
   * Unassigns a professional from a branch and cleans up their schedule slots.
   */
  async removeProfessionalFromBranch(
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
        message: 'Professional branch assignment not found',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.branchProfessionalSchedule.deleteMany({
        where: {
          organizationId,
          branchId,
          userId,
        },
      });

      await tx.userBranchAccess.delete({
        where: {
          userId_branchId: {
            userId,
            branchId,
          },
        },
      });

      this.logger.log({
        event: 'professional_branch_unassigned',
        organizationId,
        userId,
        branchId,
      });

      return {
        success: true,
        message: 'Professional unassigned from branch successfully',
      };
    });
  }

  /**
   * Helper to validate schedule time ranges and ensure no overlaps per day.
   */
  private validateScheduleSlots(schedules: ScheduleSlotDto[]): void {
    for (const slot of schedules) {
      if (slot.startTime >= slot.endTime) {
        throw new BadRequestException({
          statusCode: HttpStatus.BAD_REQUEST,
          code: 'INVALID_SCHEDULE_TIME_RANGE',
          message: `Schedule slot start time (${slot.startTime}) must be strictly earlier than end time (${slot.endTime})`,
        });
      }
    }

    const slotsByDay = new Map<number, ScheduleSlotDto[]>();
    for (const slot of schedules) {
      const list = slotsByDay.get(slot.dayOfWeek) ?? [];
      list.push(slot);
      slotsByDay.set(slot.dayOfWeek, list);
    }

    for (const [day, daySlots] of slotsByDay.entries()) {
      const sorted = [...daySlots].sort((a, b) =>
        a.startTime.localeCompare(b.startTime),
      );
      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const next = sorted[i + 1];
        if (current.endTime > next.startTime) {
          throw new BadRequestException({
            statusCode: HttpStatus.BAD_REQUEST,
            code: 'SCHEDULE_SLOTS_OVERLAP',
            message: `Overlapping schedule slots detected for day ${day}: (${current.startTime}-${current.endTime}) overlaps with (${next.startTime}-${next.endTime})`,
          });
        }
      }
    }
  }
}
