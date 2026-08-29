import { MembershipRole, UserRole } from '@prisma/client';
import { TenantResolutionMode } from '../../../common/request-context/request-context.service';
import type { TenantContext } from '../../../tenant-context/tenant-context.types';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';

describe('BranchesController', () => {
  let controller: BranchesController;
  let service: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    assignUser: jest.Mock;
    removeUserAccess: jest.Mock;
    getUserBranches: jest.Mock;
    getBranchUsers: jest.Mock;
    getBranchProfessionals: jest.Mock;
    assignProfessionalWithSchedule: jest.Mock;
    updateProfessionalSchedule: jest.Mock;
    removeProfessionalFromBranch: jest.Mock;
  };

  const mockTenant: TenantContext = {
    userId: '23000000-0000-4000-8000-000000000001',
    organizationId: '22000000-0000-4000-8000-000000000001',
    membershipId: '24000000-0000-4000-8000-000000000001',
    organizationRole: MembershipRole.OWNER,
    legacyUserRole: UserRole.ADMIN,
    resolutionMode: TenantResolutionMode.EXPLICIT,
  };

  const mockUser = {
    id: '23000000-0000-4000-8000-000000000001',
    name: 'Admin User',
    email: 'admin@example.com',
    role: UserRole.ADMIN,
  };

  const branchId = '34000000-0000-4000-8000-000000000001';

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      assignUser: jest.fn(),
      removeUserAccess: jest.fn(),
      getUserBranches: jest.fn(),
      getBranchUsers: jest.fn(),
      getBranchProfessionals: jest.fn(),
      assignProfessionalWithSchedule: jest.fn(),
      updateProfessionalSchedule: jest.fn(),
      removeProfessionalFromBranch: jest.fn(),
    };

    controller = new BranchesController(service as unknown as BranchesService);
  });

  it('delegates create to service', async () => {
    const dto = { name: 'Sede Central', code: 'CDMX-CENTRO' };
    service.create.mockResolvedValue({ id: branchId, ...dto });

    const result = await controller.create(mockTenant, dto);
    expect(result.id).toBe(branchId);
    expect(service.create).toHaveBeenCalledWith(mockTenant.organizationId, dto);
  });

  it('delegates findAll to service', async () => {
    service.findAll.mockResolvedValue([{ id: branchId }]);
    const result = await controller.findAll(mockTenant, 'true');
    expect(result).toHaveLength(1);
    expect(service.findAll).toHaveBeenCalledWith(mockTenant.organizationId, {
      includeInactive: true,
    });
  });

  it('delegates findOne to service', async () => {
    service.findOne.mockResolvedValue({ id: branchId });
    const result = await controller.findOne(mockTenant, branchId);
    expect(result.id).toBe(branchId);
    expect(service.findOne).toHaveBeenCalledWith(
      mockTenant.organizationId,
      branchId,
    );
  });

  it('delegates update to service', async () => {
    const dto = { name: 'New Name' };
    service.update.mockResolvedValue({ id: branchId, ...dto });
    const result = await controller.update(mockTenant, branchId, dto);
    expect(result.name).toBe('New Name');
    expect(service.update).toHaveBeenCalledWith(
      mockTenant.organizationId,
      branchId,
      dto,
    );
  });

  it('delegates remove to service', async () => {
    service.remove.mockResolvedValue({ id: branchId, isActive: false });
    const result = await controller.remove(mockTenant, branchId);
    expect(result.isActive).toBe(false);
    expect(service.remove).toHaveBeenCalledWith(
      mockTenant.organizationId,
      branchId,
    );
  });

  it('delegates assignUser to service', async () => {
    const dto = { userId: 'user-1', branchId, isPrimary: true };
    service.assignUser.mockResolvedValue({ id: 'access-1' });
    const result = await controller.assignUser(mockTenant, branchId, dto);
    expect(result.id).toBe('access-1');
    expect(service.assignUser).toHaveBeenCalledWith(
      mockTenant.organizationId,
      dto,
    );
  });

  it('delegates removeUserAccess to service', async () => {
    service.removeUserAccess.mockResolvedValue({ success: true });
    const result = await controller.removeUserAccess(
      mockTenant,
      branchId,
      'user-1',
    );
    expect(result.success).toBe(true);
    expect(service.removeUserAccess).toHaveBeenCalledWith(
      mockTenant.organizationId,
      branchId,
      'user-1',
    );
  });

  it('delegates getBranchUsers to service', async () => {
    service.getBranchUsers.mockResolvedValue([{ userId: 'user-1' }]);
    const result = await controller.getBranchUsers(mockTenant, branchId);
    expect(result).toHaveLength(1);
    expect(service.getBranchUsers).toHaveBeenCalledWith(
      mockTenant.organizationId,
      branchId,
    );
  });

  it('delegates getMyBranches to service', async () => {
    service.getUserBranches.mockResolvedValue([{ branchId }]);
    const result = await controller.getMyBranches(mockTenant);
    expect(result).toHaveLength(1);
    expect(service.getUserBranches).toHaveBeenCalledWith(
      mockTenant.organizationId,
      mockTenant.userId,
    );
  });

  it('delegates getBranchProfessionals to service', async () => {
    service.getBranchProfessionals.mockResolvedValue([
      { userId: 'user-1', schedules: [] },
    ]);
    const result = await controller.getBranchProfessionals(
      mockTenant,
      branchId,
    );
    expect(result).toHaveLength(1);
    expect(service.getBranchProfessionals).toHaveBeenCalledWith(
      mockTenant.organizationId,
      branchId,
    );
  });

  it('delegates assignProfessional to service', async () => {
    const dto = { userId: 'user-1', isPrimary: true, schedules: [] };
    service.assignProfessionalWithSchedule.mockResolvedValue({ id: 'acc-1' });
    const result = await controller.assignProfessional(
      mockTenant,
      branchId,
      dto,
    );
    expect(result.id).toBe('acc-1');
    expect(service.assignProfessionalWithSchedule).toHaveBeenCalledWith(
      mockTenant.organizationId,
      branchId,
      dto,
    );
  });

  it('delegates updateProfessionalSchedule to service', async () => {
    const dto = {
      schedules: [
        {
          dayOfWeek: 1,
          startTime: '09:00',
          endTime: '13:00',
        },
      ],
    };
    service.updateProfessionalSchedule.mockResolvedValue({
      userId: 'user-1',
      schedules: dto.schedules,
    });
    const result = await controller.updateProfessionalSchedule(
      mockTenant,
      mockUser,
      branchId,
      'user-1',
      dto,
    );
    expect(result.userId).toBe('user-1');
    expect(service.updateProfessionalSchedule).toHaveBeenCalledWith(
      mockTenant.organizationId,
      branchId,
      'user-1',
      dto,
      mockUser,
    );
  });

  it('delegates removeProfessional to service', async () => {
    service.removeProfessionalFromBranch.mockResolvedValue({ success: true });
    const result = await controller.removeProfessional(
      mockTenant,
      branchId,
      'user-1',
    );
    expect(result.success).toBe(true);
    expect(service.removeProfessionalFromBranch).toHaveBeenCalledWith(
      mockTenant.organizationId,
      branchId,
      'user-1',
    );
  });
});
