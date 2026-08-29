import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MembershipStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { EntitlementKey } from '../../../entitlements/entitlements.constants';
import { EntitlementsService } from '../../../entitlements/entitlements.service';
import { PlanLimitExceededException } from '../../../entitlements/exceptions/plan-limit-exceeded.exception';
import { BranchesService } from './branches.service';

describe('BranchesService', () => {
  let service: BranchesService;
  let prisma: {
    $transaction: jest.Mock;
    branch: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    organizationMembership: {
      findFirst: jest.Mock;
    };
    userBranchAccess: {
      upsert: jest.Mock;
      updateMany: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      delete: jest.Mock;
    };
    branchProfessionalSchedule: {
      findMany: jest.Mock;
      createMany: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let entitlementsService: {
    checkNumericQuota: jest.Mock;
    countCurrentUsage: jest.Mock;
    getEntitlement: jest.Mock;
  };

  const orgId = '22000000-0000-4000-8000-000000000001';
  const branchId = '34000000-0000-4000-8000-000000000001';
  const userId = '23000000-0000-4000-8000-000000000001';

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn((callback) => callback(prisma)),
      branch: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      organizationMembership: {
        findFirst: jest.fn(),
      },
      userBranchAccess: {
        upsert: jest.fn(),
        updateMany: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
      },
      branchProfessionalSchedule: {
        findMany: jest.fn(),
        createMany: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    entitlementsService = {
      checkNumericQuota: jest.fn(),
      countCurrentUsage: jest.fn(),
      getEntitlement: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchesService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntitlementsService, useValue: entitlementsService },
      ],
    }).compile();

    service = module.get<BranchesService>(BranchesService);
  });

  describe('create', () => {
    it('rejects creation when plan branch quota is exceeded (PLAN_LIMIT_EXCEEDED / 403)', async () => {
      entitlementsService.checkNumericQuota.mockRejectedValue(
        new PlanLimitExceededException({
          quotaKey: EntitlementKey.MAX_BRANCHES,
          limit: 1,
          currentUsage: 1,
        }),
      );

      await expect(
        service.create(orgId, {
          name: 'Branch 2',
          code: 'BR-2',
        }),
      ).rejects.toThrow(PlanLimitExceededException);

      expect(entitlementsService.checkNumericQuota).toHaveBeenCalledWith(
        orgId,
        EntitlementKey.MAX_BRANCHES,
        { proposedIncrement: 1, throwOnExceeded: true },
      );
      expect(prisma.branch.create).not.toHaveBeenCalled();
    });

    it('rejects creation when branch code already exists in organization (BRANCH_CODE_EXISTS / 409)', async () => {
      entitlementsService.checkNumericQuota.mockResolvedValue({
        allowed: true,
        quotaKey: EntitlementKey.MAX_BRANCHES,
        limit: 3,
        currentUsage: 1,
        remaining: 2,
        isUnlimited: false,
      });

      prisma.branch.findFirst.mockResolvedValue({
        id: branchId,
        organizationId: orgId,
        code: 'CDMX-CENTRO',
        name: 'Existing Branch',
      });

      try {
        await service.create(orgId, {
          name: 'Duplicate Branch',
          code: 'cdmx-centro',
        });
        fail('Should have thrown ConflictException');
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictException);
        const conflict = error as ConflictException;
        expect(conflict.getStatus()).toBe(409);
        const response = conflict.getResponse() as { code: string };
        expect(response.code).toBe('BRANCH_CODE_EXISTS');
      }

      expect(prisma.branch.create).not.toHaveBeenCalled();
    });

    it('creates a new branch successfully (201)', async () => {
      entitlementsService.checkNumericQuota.mockResolvedValue({
        allowed: true,
        quotaKey: EntitlementKey.MAX_BRANCHES,
        limit: 3,
        currentUsage: 1,
        remaining: 2,
        isUnlimited: false,
      });

      prisma.branch.findFirst.mockResolvedValue(null);
      const createdBranch = {
        id: branchId,
        organizationId: orgId,
        name: 'Sede Norte',
        code: 'CDMX-NORTE',
        address: 'Av. Politécnico 456',
        phone: '+525587654321',
        timezone: 'America/Mexico_City',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      prisma.branch.create.mockResolvedValue(createdBranch);

      const result = await service.create(orgId, {
        name: 'Sede Norte',
        code: 'cdmx-norte',
        address: 'Av. Politécnico 456',
        phone: '+525587654321',
        timezone: 'America/Mexico_City',
        isActive: true,
      });

      expect(result).toEqual(createdBranch);
      expect(prisma.branch.create).toHaveBeenCalledWith({
        data: {
          organizationId: orgId,
          name: 'Sede Norte',
          code: 'CDMX-NORTE',
          address: 'Av. Politécnico 456',
          phone: '+525587654321',
          timezone: 'America/Mexico_City',
          isActive: true,
        },
      });
    });
  });

  describe('remove', () => {
    it('blocks deletion of the only active branch (CANNOT_DELETE_ONLY_BRANCH / 403)', async () => {
      prisma.branch.findFirst.mockResolvedValue({
        id: branchId,
        organizationId: orgId,
        name: 'Sede Central',
        code: 'CDMX-CENTRO',
        isActive: true,
        deletedAt: null,
      });

      // Only 1 active branch in the org
      prisma.branch.count.mockResolvedValue(1);

      try {
        await service.remove(orgId, branchId);
        fail('Should have thrown ForbiddenException');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        const forbidden = error as ForbiddenException;
        expect(forbidden.getStatus()).toBe(403);
        const response = forbidden.getResponse() as { code: string };
        expect(response.code).toBe('CANNOT_DELETE_ONLY_BRANCH');
      }

      expect(prisma.branch.update).not.toHaveBeenCalled();
    });

    it('soft-deletes a branch when multiple active branches exist', async () => {
      prisma.branch.findFirst.mockResolvedValue({
        id: branchId,
        organizationId: orgId,
        name: 'Sede Norte',
        code: 'CDMX-NORTE',
        isActive: true,
        deletedAt: null,
      });

      // 2 active branches in the org
      prisma.branch.count.mockResolvedValue(2);
      prisma.branch.update.mockResolvedValue({
        id: branchId,
        isActive: false,
        deletedAt: new Date(),
      });

      const result = await service.remove(orgId, branchId);

      expect(result.isActive).toBe(false);
      expect(prisma.branch.update).toHaveBeenCalledWith({
        where: { id: branchId },
        data: {
          isActive: false,
          deletedAt: expect.any(Date) as Date,
        },
      });
    });
  });

  describe('findAll', () => {
    it('returns all active branches by default', async () => {
      const branchesList = [
        { id: branchId, name: 'Branch 1', code: 'BR-1', isActive: true },
      ];
      prisma.branch.findMany.mockResolvedValue(branchesList);

      const result = await service.findAll(orgId);

      expect(result).toEqual(branchesList);
      expect(prisma.branch.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: orgId,
          deletedAt: null,
          isActive: true,
        },
        include: {
          _count: {
            select: { userAccesses: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  describe('findOne', () => {
    it('returns branch if found', async () => {
      const mockBranch = {
        id: branchId,
        organizationId: orgId,
        name: 'Sede Central',
        code: 'CDMX-CENTRO',
      };
      prisma.branch.findFirst.mockResolvedValue(mockBranch);

      const result = await service.findOne(orgId, branchId);
      expect(result).toEqual(mockBranch);
    });

    it('throws NotFoundException if branch does not exist', async () => {
      prisma.branch.findFirst.mockResolvedValue(null);

      await expect(service.findOne(orgId, 'non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates branch successfully', async () => {
      prisma.branch.findFirst
        .mockResolvedValueOnce({
          id: branchId,
          organizationId: orgId,
          name: 'Old Name',
          code: 'CODE-OLD',
        })
        .mockResolvedValueOnce(null); // no duplicate

      prisma.branch.update.mockResolvedValue({
        id: branchId,
        name: 'New Name',
        code: 'CODE-NEW',
      });

      const result = await service.update(orgId, branchId, {
        name: 'New Name',
        code: 'code-new',
      });

      expect(result.name).toBe('New Name');
      expect(prisma.branch.update).toHaveBeenCalled();
    });

    it('throws ConflictException on duplicate code during update', async () => {
      prisma.branch.findFirst
        .mockResolvedValueOnce({
          id: branchId,
          organizationId: orgId,
          name: 'Branch 1',
          code: 'CODE-1',
        })
        .mockResolvedValueOnce({
          id: 'another-branch-id',
          code: 'CODE-2',
        });

      await expect(
        service.update(orgId, branchId, {
          code: 'code-2',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('assignUser', () => {
    it('assigns user to branch and clears other primary flags when isPrimary is true', async () => {
      prisma.branch.findFirst.mockResolvedValue({
        id: branchId,
        organizationId: orgId,
      });

      prisma.organizationMembership.findFirst.mockResolvedValue({
        id: 'membership-1',
        organizationId: orgId,
        userId,
        status: MembershipStatus.ACTIVE,
      });

      prisma.userBranchAccess.updateMany.mockResolvedValue({ count: 1 });
      prisma.userBranchAccess.upsert.mockResolvedValue({
        id: 'access-1',
        organizationId: orgId,
        userId,
        branchId,
        isPrimary: true,
      });

      const result = await service.assignUser(orgId, {
        userId,
        branchId,
        isPrimary: true,
      });

      expect(result.isPrimary).toBe(true);
      expect(prisma.userBranchAccess.updateMany).toHaveBeenCalledWith({
        where: {
          organizationId: orgId,
          userId,
          isPrimary: true,
        },
        data: {
          isPrimary: false,
        },
      });
      expect(prisma.userBranchAccess.upsert).toHaveBeenCalled();
    });

    it('throws NotFoundException when membership is not active', async () => {
      prisma.branch.findFirst.mockResolvedValue({
        id: branchId,
        organizationId: orgId,
      });

      prisma.organizationMembership.findFirst.mockResolvedValue(null);

      await expect(
        service.assignUser(orgId, {
          userId,
          branchId,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeUserAccess', () => {
    it('removes access record', async () => {
      prisma.branch.findFirst.mockResolvedValue({
        id: branchId,
        organizationId: orgId,
      });

      prisma.userBranchAccess.findUnique.mockResolvedValue({
        userId,
        branchId,
        organizationId: orgId,
      });

      prisma.userBranchAccess.delete.mockResolvedValue({
        userId,
        branchId,
      });

      const result = await service.removeUserAccess(orgId, branchId, userId);
      expect(result.success).toBe(true);
      expect(prisma.userBranchAccess.delete).toHaveBeenCalledWith({
        where: {
          userId_branchId: {
            userId,
            branchId,
          },
        },
      });
    });
  });

  describe('getBranchProfessionals', () => {
    it('returns assigned professionals with their active schedule slots', async () => {
      prisma.branch.findFirst.mockResolvedValue({
        id: branchId,
        organizationId: orgId,
      });

      prisma.userBranchAccess.findMany.mockResolvedValue([
        {
          id: 'acc-1',
          organizationId: orgId,
          branchId,
          userId,
          isPrimary: true,
          createdAt: new Date(),
          user: {
            id: userId,
            name: 'Dr. John Doe',
            email: 'john@example.com',
            role: 'PSYCHOLOGIST',
          },
        },
      ]);

      prisma.branchProfessionalSchedule.findMany.mockResolvedValue([
        {
          id: 'sch-1',
          organizationId: orgId,
          branchId,
          userId,
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '14:00',
          durationSlotMinutes: 60,
          isActive: true,
        },
      ]);

      const result = await service.getBranchProfessionals(orgId, branchId);

      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe(userId);
      expect(result[0].schedules).toHaveLength(1);
      expect(result[0].schedules[0].startTime).toBe('09:00');
    });
  });

  describe('assignProfessionalWithSchedule', () => {
    it('assigns professional and persists schedule slots', async () => {
      prisma.branch.findFirst.mockResolvedValue({
        id: branchId,
        organizationId: orgId,
      });

      prisma.organizationMembership.findFirst.mockResolvedValue({
        id: 'mem-1',
        organizationId: orgId,
        userId,
        status: MembershipStatus.ACTIVE,
      });

      prisma.userBranchAccess.upsert.mockResolvedValue({
        id: 'acc-1',
        organizationId: orgId,
        branchId,
        userId,
        isPrimary: true,
      });

      prisma.branchProfessionalSchedule.findMany.mockResolvedValue([
        {
          id: 'sch-1',
          organizationId: orgId,
          branchId,
          userId,
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '13:00',
          durationSlotMinutes: 60,
          isActive: true,
        },
      ]);

      const result = await service.assignProfessionalWithSchedule(
        orgId,
        branchId,
        {
          userId,
          isPrimary: true,
          schedules: [
            {
              dayOfWeek: 1,
              startTime: '09:00',
              endTime: '13:00',
              durationSlotMinutes: 60,
            },
          ],
        },
      );

      expect(result.id).toBe('acc-1');
      expect(result.schedules).toHaveLength(1);
      expect(prisma.branchProfessionalSchedule.deleteMany).toHaveBeenCalled();
      expect(prisma.branchProfessionalSchedule.createMany).toHaveBeenCalled();
    });

    it('throws BadRequestException if startTime >= endTime', async () => {
      prisma.branch.findFirst.mockResolvedValue({
        id: branchId,
        organizationId: orgId,
      });

      await expect(
        service.assignProfessionalWithSchedule(orgId, branchId, {
          userId,
          schedules: [
            {
              dayOfWeek: 1,
              startTime: '14:00',
              endTime: '10:00',
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if slots on same day overlap', async () => {
      prisma.branch.findFirst.mockResolvedValue({
        id: branchId,
        organizationId: orgId,
      });

      await expect(
        service.assignProfessionalWithSchedule(orgId, branchId, {
          userId,
          schedules: [
            {
              dayOfWeek: 1,
              startTime: '09:00',
              endTime: '12:00',
            },
            {
              dayOfWeek: 1,
              startTime: '11:00',
              endTime: '14:00',
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateProfessionalSchedule', () => {
    it('updates schedule when performed by the professional themselves', async () => {
      prisma.branch.findFirst.mockResolvedValue({
        id: branchId,
        organizationId: orgId,
      });

      prisma.userBranchAccess.findUnique.mockResolvedValue({
        userId,
        branchId,
        organizationId: orgId,
      });

      prisma.branchProfessionalSchedule.findMany.mockResolvedValue([
        {
          id: 'sch-2',
          organizationId: orgId,
          branchId,
          userId,
          dayOfWeek: 2,
          startTime: '10:00',
          endTime: '16:00',
          durationSlotMinutes: 60,
          isActive: true,
        },
      ]);

      const result = await service.updateProfessionalSchedule(
        orgId,
        branchId,
        userId,
        {
          schedules: [
            {
              dayOfWeek: 2,
              startTime: '10:00',
              endTime: '16:00',
              durationSlotMinutes: 60,
            },
          ],
        },
        { id: userId, role: 'PSYCHOLOGIST' },
      );

      expect(result.schedules).toHaveLength(1);
      expect(result.schedules[0].startTime).toBe('10:00');
    });

    it('throws ForbiddenException if another non-admin user attempts update', async () => {
      prisma.branch.findFirst.mockResolvedValue({
        id: branchId,
        organizationId: orgId,
      });

      prisma.userBranchAccess.findUnique.mockResolvedValue({
        userId,
        branchId,
        organizationId: orgId,
      });

      await expect(
        service.updateProfessionalSchedule(
          orgId,
          branchId,
          userId,
          {
            schedules: [],
          },
          { id: 'other-user-uuid', role: 'PSYCHOLOGIST' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('removeProfessionalFromBranch', () => {
    it('unassigns professional and cleans up schedules', async () => {
      prisma.branch.findFirst.mockResolvedValue({
        id: branchId,
        organizationId: orgId,
      });

      prisma.userBranchAccess.findUnique.mockResolvedValue({
        userId,
        branchId,
        organizationId: orgId,
      });

      const result = await service.removeProfessionalFromBranch(
        orgId,
        branchId,
        userId,
      );

      expect(result.success).toBe(true);
      expect(prisma.branchProfessionalSchedule.deleteMany).toHaveBeenCalled();
      expect(prisma.userBranchAccess.delete).toHaveBeenCalled();
    });
  });
});
