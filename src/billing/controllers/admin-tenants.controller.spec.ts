import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationStatus, SubscriptionStatus } from '@prisma/client';
import { AdminTenantsController } from './admin-tenants.controller';
import { AdminTenantsService } from '../services/admin-tenants.service';

describe('AdminTenantsController', () => {
  let controller: AdminTenantsController;
  let service: {
    listTenants: jest.Mock;
    extendTrial: jest.Mock;
    grantLifetime: jest.Mock;
    updateQuotas: jest.Mock;
    freezeTenant: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      listTenants: jest.fn(),
      extendTrial: jest.fn(),
      grantLifetime: jest.fn(),
      updateQuotas: jest.fn(),
      freezeTenant: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminTenantsController],
      providers: [{ provide: AdminTenantsService, useValue: service }],
    }).compile();

    controller = module.get<AdminTenantsController>(AdminTenantsController);
  });

  it('delegates listTenants to service', async () => {
    service.listTenants.mockResolvedValue([]);

    const result = await controller.listTenants();

    expect(service.listTenants).toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('delegates extendTrial to service', async () => {
    service.extendTrial.mockResolvedValue({
      id: 'sub-1',
      status: SubscriptionStatus.TRIALING,
    });

    const result = await controller.extendTrial('org-1', { daysToAdd: 14 });

    expect(service.extendTrial).toHaveBeenCalledWith('org-1', {
      daysToAdd: 14,
    });
    expect(result.status).toBe(SubscriptionStatus.TRIALING);
  });

  it('delegates grantLifetime to service', async () => {
    service.grantLifetime.mockResolvedValue({
      id: 'sub-1',
      status: SubscriptionStatus.LIFETIME_SPONSOR,
    });

    const result = await controller.grantLifetime('org-1', {
      sponsorNotes: 'Convenio Aliado',
      customTherapistsLimit: 10,
    });

    expect(service.grantLifetime).toHaveBeenCalledWith('org-1', {
      sponsorNotes: 'Convenio Aliado',
      customTherapistsLimit: 10,
    });
    expect(result.status).toBe(SubscriptionStatus.LIFETIME_SPONSOR);
  });

  it('delegates updateQuotas to service', async () => {
    service.updateQuotas.mockResolvedValue({
      id: 'sub-1',
      customTherapistsLimit: 20,
    });

    const result = await controller.updateQuotas('org-1', {
      customTherapistsLimit: 20,
    });

    expect(service.updateQuotas).toHaveBeenCalledWith('org-1', {
      customTherapistsLimit: 20,
    });
    expect(result.customTherapistsLimit).toBe(20);
  });

  it('delegates freezeTenant to service', async () => {
    service.freezeTenant.mockResolvedValue({
      success: true,
      isFrozen: true,
    });

    const result = await controller.freezeTenant('org-1', {
      freeze: true,
      reason: 'Auditoría',
    });

    expect(service.freezeTenant).toHaveBeenCalledWith('org-1', {
      freeze: true,
      reason: 'Auditoría',
    });
    expect(result.isFrozen).toBe(true);
  });
});
