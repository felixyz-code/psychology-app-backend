import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionStatus, UserRole } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AUDIT_LOG_METADATA_KEY } from '../../audit-logs/audit-logs.constants';
import { AuditLogMetadataOptions } from '../../audit-logs/audit-logs.types';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SKIP_TENANT_CONTEXT_KEY } from '../../tenant-context/tenant-context.constants';
import { BillingService } from '../billing.service';
import { AdminBillingController } from './admin-billing.controller';

describe('AdminBillingController', () => {
  let app: INestApplication<App>;
  let billingService: {
    manualTransition: jest.Mock;
    extendTrial: jest.Mock;
    planOverride: jest.Mock;
  };
  let currentUser: { id: string; role?: UserRole } | null = null;

  beforeEach(async () => {
    currentUser = { id: 'admin-1', role: UserRole.ADMIN };

    billingService = {
      manualTransition: jest.fn(),
      extendTrial: jest.fn(),
      planOverride: jest.fn(),
    };

    const mockJwtAuthGuard = {
      canActivate: (context: ExecutionContext) => {
        if (!currentUser) {
          throw new UnauthorizedException('Authentication is required');
        }
        const req = context.switchToHttp().getRequest();
        req.user = currentUser;
        return true;
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AdminBillingController],
      providers: [
        {
          provide: BillingService,
          useValue: billingService,
        },
        Reflector,
        RolesGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Security & RBAC Enforcement', () => {
    it('rejects unauthenticated requests with 401 Unauthorized', async () => {
      currentUser = null;

      await request(app.getHttpServer())
        .post('/admin/billing/manual-transition')
        .send({
          subscriptionId: 'sub-1',
          status: SubscriptionStatus.ACTIVE,
        })
        .expect(401);

      expect(billingService.manualTransition).not.toHaveBeenCalled();
    });

    it('rejects non-ADMIN requests (e.g. PSYCHOLOGIST) with 403 Forbidden', async () => {
      currentUser = { id: 'psychologist-1', role: UserRole.PSYCHOLOGIST };

      await request(app.getHttpServer())
        .post('/admin/billing/manual-transition')
        .send({
          subscriptionId: 'sub-1',
          status: SubscriptionStatus.ACTIVE,
        })
        .expect(403);

      expect(billingService.manualTransition).not.toHaveBeenCalled();
    });

    it('rejects non-ADMIN requests for trial extensions with 403 Forbidden', async () => {
      currentUser = { id: 'psychologist-1', role: UserRole.PSYCHOLOGIST };

      await request(app.getHttpServer())
        .post('/admin/billing/extend-trial')
        .send({
          subscriptionId: 'sub-1',
          daysToAdd: 7,
        })
        .expect(403);

      expect(billingService.extendTrial).not.toHaveBeenCalled();
    });

    it('rejects non-ADMIN requests for plan overrides with 403 Forbidden', async () => {
      currentUser = { id: 'psychologist-1', role: UserRole.PSYCHOLOGIST };

      await request(app.getHttpServer())
        .patch('/admin/billing/plan-override')
        .send({
          subscriptionId: 'sub-1',
          newPlanCode: 'enterprise-custom',
        })
        .expect(403);

      expect(billingService.planOverride).not.toHaveBeenCalled();
    });

    it('has metadata decorators for SkipTenantContext, Roles, and AuditLog', () => {
      const isTenantSkipped = Reflect.getMetadata(
        SKIP_TENANT_CONTEXT_KEY,
        AdminBillingController,
      ) as boolean;
      expect(isTenantSkipped).toBe(true);

      const classRoles = Reflect.getMetadata(
        ROLES_KEY,
        AdminBillingController,
      ) as UserRole[];
      expect(classRoles).toEqual([UserRole.ADMIN]);

      const transitionDescriptor = Object.getOwnPropertyDescriptor(
        AdminBillingController.prototype,
        'manualTransition',
      );
      const transitionAudit = Reflect.getMetadata(
        AUDIT_LOG_METADATA_KEY,
        transitionDescriptor?.value as object,
      ) as AuditLogMetadataOptions;
      expect(transitionAudit).toEqual({
        action: 'ADMIN_BILLING_OVERRIDE',
        resourceType: 'Subscription',
      });

      const extendDescriptor = Object.getOwnPropertyDescriptor(
        AdminBillingController.prototype,
        'extendTrial',
      );
      const extendAudit = Reflect.getMetadata(
        AUDIT_LOG_METADATA_KEY,
        extendDescriptor?.value as object,
      ) as AuditLogMetadataOptions;
      expect(extendAudit).toEqual({
        action: 'ADMIN_BILLING_OVERRIDE',
        resourceType: 'Subscription',
      });

      const overrideDescriptor = Object.getOwnPropertyDescriptor(
        AdminBillingController.prototype,
        'planOverride',
      );
      const overrideAudit = Reflect.getMetadata(
        AUDIT_LOG_METADATA_KEY,
        overrideDescriptor?.value as object,
      ) as AuditLogMetadataOptions;
      expect(overrideAudit).toEqual({
        action: 'ADMIN_BILLING_OVERRIDE',
        resourceType: 'Subscription',
      });
    });
  });

  describe('POST /admin/billing/manual-transition', () => {
    it('allows ADMIN to manually transition subscription status', async () => {
      const updatedSub = {
        id: 'sub-1',
        status: SubscriptionStatus.ACTIVE,
        cancelReason: 'Customer account reinstated',
      };
      billingService.manualTransition.mockResolvedValue(updatedSub);

      const response = await request(app.getHttpServer())
        .post('/admin/billing/manual-transition')
        .send({
          subscriptionId: 'sub-1',
          status: SubscriptionStatus.ACTIVE,
          reason: 'Customer account reinstated',
        })
        .expect(200);

      expect(billingService.manualTransition).toHaveBeenCalledWith(
        'sub-1',
        SubscriptionStatus.ACTIVE,
        'Customer account reinstated',
      );
      expect(response.body).toEqual(updatedSub);
    });

    it('rejects invalid status enum with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .post('/admin/billing/manual-transition')
        .send({
          subscriptionId: 'sub-1',
          status: 'INVALID_STATUS',
        })
        .expect(400);

      expect(billingService.manualTransition).not.toHaveBeenCalled();
    });
  });

  describe('POST /admin/billing/extend-trial', () => {
    it('allows ADMIN to extend trial period', async () => {
      const updatedSub = {
        id: 'sub-1',
        status: SubscriptionStatus.TRIALING,
        trialEndsAt: new Date('2026-09-01T00:00:00.000Z').toISOString(),
      };
      billingService.extendTrial.mockResolvedValue(updatedSub);

      const response = await request(app.getHttpServer())
        .post('/admin/billing/extend-trial')
        .send({
          subscriptionId: 'sub-1',
          daysToAdd: 14,
        })
        .expect(200);

      expect(billingService.extendTrial).toHaveBeenCalledWith('sub-1', 14);
      expect(response.body).toEqual(updatedSub);
    });

    it('rejects non-positive daysToAdd with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .post('/admin/billing/extend-trial')
        .send({
          subscriptionId: 'sub-1',
          daysToAdd: 0,
        })
        .expect(400);

      expect(billingService.extendTrial).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /admin/billing/plan-override', () => {
    it('allows ADMIN to force override a subscription plan', async () => {
      const updatedSub = {
        id: 'sub-1',
        planId: 'plan-enterprise-id',
        status: SubscriptionStatus.ACTIVE,
      };
      billingService.planOverride.mockResolvedValue(updatedSub);

      const response = await request(app.getHttpServer())
        .patch('/admin/billing/plan-override')
        .send({
          subscriptionId: 'sub-1',
          newPlanCode: 'enterprise-custom',
        })
        .expect(200);

      expect(billingService.planOverride).toHaveBeenCalledWith(
        'sub-1',
        'enterprise-custom',
      );
      expect(response.body).toEqual(updatedSub);
    });

    it('rejects missing newPlanCode with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .patch('/admin/billing/plan-override')
        .send({
          subscriptionId: 'sub-1',
        })
        .expect(400);

      expect(billingService.planOverride).not.toHaveBeenCalled();
    });
  });
});
