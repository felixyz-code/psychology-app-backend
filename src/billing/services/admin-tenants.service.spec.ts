import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  OrganizationStatus,
  PlanTier,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit-logs/audit-logs.service';
import { EntitlementKey } from '../../entitlements/entitlements.constants';
import { AdminTenantsService } from './admin-tenants.service';

describe('AdminTenantsService', () => {
  let service: AdminTenantsService;
  let auditLogService: {
    findAll: jest.Mock;
  };
  let prisma: {
    organization: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    subscription: {
      create: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    plan: {
      findFirst: jest.Mock;
    };
    patient: {
      count: jest.Mock;
    };
    appointment: {
      count: jest.Mock;
    };
    user: {
      count: jest.Mock;
    };
  };

  beforeEach(async () => {
    auditLogService = {
      findAll: jest.fn(),
    };
    prisma = {
      organization: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      subscription: {
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      plan: {
        findFirst: jest.fn(),
      },
      patient: {
        count: jest.fn(),
      },
      appointment: {
        count: jest.fn(),
      },
      user: {
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminTenantsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLogService },
      ],
    }).compile();

    service = module.get<AdminTenantsService>(AdminTenantsService);
  });

  describe('listTenants', () => {
    it('returns consolidated organizations with subscriptions, quotas and usage', async () => {
      const mockOrgs = [
        {
          id: 'org-1',
          slug: 'org-alpha',
          displayName: 'Org Alpha',
          legalName: 'Alpha Health S.A.',
          status: OrganizationStatus.ACTIVE,
          timezone: 'America/Hermosillo',
          createdAt: new Date('2026-01-01'),
          subscriptions: [
            {
              id: 'sub-1',
              status: SubscriptionStatus.LIFETIME_SPONSOR,
              trialEndsAt: null,
              currentPeriodEndsAt: new Date('2099-12-31'),
              isExempt: true,
              sponsorNotes: 'Convenio Fundación Sonora',
              customTherapistsLimit: 15,
              customPatientsLimit: 300,
              customBranchesLimit: 4,
              plan: {
                tier: PlanTier.ENTERPRISE,
                code: 'enterprise-custom',
                name: 'Enterprise Sponsor',
                entitlements: [
                  {
                    definition: { key: EntitlementKey.MAX_STAFF_SEATS },
                    numericValue: 10,
                  },
                  {
                    definition: { key: EntitlementKey.MAX_PATIENTS },
                    numericValue: 100,
                  },
                  {
                    definition: { key: EntitlementKey.MAX_BRANCHES },
                    numericValue: 2,
                  },
                ],
              },
            },
          ],
          _count: {
            memberships: 5,
            patients: 42,
            branches: 2,
          },
        },
      ];

      prisma.organization.findMany.mockResolvedValue(mockOrgs);

      const result = await service.listTenants();

      expect(result).toHaveLength(1);
      expect(result[0].displayName).toBe('Org Alpha');
      expect(result[0].subscription?.status).toBe(
        SubscriptionStatus.LIFETIME_SPONSOR,
      );
      expect(result[0].subscription?.isExempt).toBe(true);
      expect(result[0].subscription?.sponsorNotes).toBe(
        'Convenio Fundación Sonora',
      );
      expect(result[0].usage.therapistsLimit).toBe(15);
      expect(result[0].usage.patientsLimit).toBe(300);
      expect(result[0].usage.branchesLimit).toBe(4);
      expect(result[0].usage.therapistsCount).toBe(5);
    });
  });

  describe('extendTrial', () => {
    it('extends trial end date for existing subscription', async () => {
      const existingSub = {
        id: 'sub-trial',
        trialEndsAt: new Date('2026-09-01T00:00:00Z'),
        currentPeriodEndsAt: new Date('2026-09-01T00:00:00Z'),
      };

      prisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        subscriptions: [existingSub],
      });

      prisma.subscription.update.mockResolvedValue({
        id: 'sub-trial',
        status: SubscriptionStatus.TRIALING,
        trialEndsAt: new Date('2026-09-15T00:00:00Z'),
        currentPeriodEndsAt: new Date('2026-09-15T00:00:00Z'),
      });

      const result = await service.extendTrial('org-1', { daysToAdd: 14 });

      expect(prisma.subscription.update).toHaveBeenCalled();
      expect(result.status).toBe(SubscriptionStatus.TRIALING);
    });

    it('throws NotFoundException if organization does not exist', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(
        service.extendTrial('invalid-org', { daysToAdd: 14 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('grantLifetime', () => {
    it('grants lifetime sponsor membership with custom quotas and exemption', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        subscriptions: [
          {
            id: 'sub-1',
            status: SubscriptionStatus.ACTIVE,
            sponsorNotes: null,
          },
        ],
      });

      prisma.subscription.update.mockResolvedValue({
        id: 'sub-1',
        status: SubscriptionStatus.LIFETIME_SPONSOR,
        isExempt: true,
        sponsorNotes: 'Convenio Aliado',
        customTherapistsLimit: 25,
      });

      const result = await service.grantLifetime('org-1', {
        sponsorNotes: 'Convenio Aliado',
        customTherapistsLimit: 25,
      });

      expect(prisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sub-1' },
          data: expect.objectContaining({
            status: SubscriptionStatus.LIFETIME_SPONSOR,
            isExempt: true,
            sponsorNotes: 'Convenio Aliado',
            customTherapistsLimit: 25,
          }),
        }),
      );
      expect(result.status).toBe(SubscriptionStatus.LIFETIME_SPONSOR);
    });
  });

  describe('updateQuotas', () => {
    it('updates custom quotas on subscription', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        subscriptions: [{ id: 'sub-1' }],
      });

      prisma.subscription.update.mockResolvedValue({
        id: 'sub-1',
        customTherapistsLimit: 30,
        customPatientsLimit: 600,
        customBranchesLimit: 5,
      });

      const result = await service.updateQuotas('org-1', {
        customTherapistsLimit: 30,
        customPatientsLimit: 600,
        customBranchesLimit: 5,
      });

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: {
          customTherapistsLimit: 30,
          customPatientsLimit: 600,
          customBranchesLimit: 5,
        },
        include: { plan: true },
      });
      expect(result.customTherapistsLimit).toBe(30);
    });
  });

  describe('freezeTenant', () => {
    it('freezes organization and sets subscription to FROZEN', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        subscriptions: [{ id: 'sub-1', status: SubscriptionStatus.ACTIVE }],
      });

      const result = await service.freezeTenant('org-1', {
        freeze: true,
        reason: 'Violation of Terms',
      });

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { status: OrganizationStatus.SUSPENDED },
      });
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: {
          status: SubscriptionStatus.FROZEN,
          cancelReason: 'Violation of Terms',
        },
      });
      expect(result.isFrozen).toBe(true);
    });

    it('unfreezes organization and restores ACTIVE status', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        subscriptions: [
          {
            id: 'sub-1',
            status: SubscriptionStatus.FROZEN,
            isExempt: false,
          },
        ],
      });

      const result = await service.freezeTenant('org-1', {
        freeze: false,
      });

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { status: OrganizationStatus.ACTIVE },
      });
      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: {
          status: SubscriptionStatus.ACTIVE,
          cancelReason: null,
        },
      });
      expect(result.isFrozen).toBe(false);
    });
  });

  describe('getGlobalAuditLogs', () => {
    it('delegates to AuditLogService.findAll with parsed filter dates', async () => {
      const mockResult = {
        items: [{ id: 'log-1', action: 'TENANT_CREATE' }],
        total: 1,
        limit: 50,
        offset: 0,
      };
      auditLogService.findAll.mockResolvedValue(mockResult);

      const result = await service.getGlobalAuditLogs({
        limit: 50,
        offset: 0,
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-31T23:59:59.999Z',
        search: 'TENANT',
      });

      expect(auditLogService.findAll).toHaveBeenCalledWith({
        limit: 50,
        offset: 0,
        from: new Date('2026-08-01T00:00:00.000Z'),
        to: new Date('2026-08-31T23:59:59.999Z'),
        search: 'TENANT',
        action: undefined,
        branchId: undefined,
        organizationId: undefined,
        resource: undefined,
        resourceId: undefined,
        resourceType: undefined,
        severity: undefined,
        userId: undefined,
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('getPlatformMetrics', () => {
    it('aggregates organization, subscription, patient, appointment and user metrics', async () => {
      prisma.organization.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(8) // active
        .mockResolvedValueOnce(2); // suspended
      prisma.subscription.count
        .mockResolvedValueOnce(3) // trialing
        .mockResolvedValueOnce(2) // lifetime
        .mockResolvedValueOnce(3); // active
      prisma.patient.count.mockResolvedValue(150);
      prisma.appointment.count.mockResolvedValue(400);
      prisma.user.count.mockResolvedValue(30);

      const result = await service.getPlatformMetrics();

      expect(result.status).toBe('HEALTHY');
      expect(result.databaseStatus).toBe('ONLINE');
      expect(result.tenants).toEqual({
        total: 10,
        active: 8,
        suspended: 2,
        trialing: 3,
        lifetime: 2,
        activeSubscriptions: 3,
      });
      expect(result.aggregates).toEqual({
        totalPatients: 150,
        totalAppointments: 400,
        totalUsers: 30,
      });
      expect(result.memory.heapUsedMB).toBeGreaterThanOrEqual(0);
      expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });
  });
});
