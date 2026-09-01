import { Test, TestingModule } from '@nestjs/testing';
import { MembershipRole, PlanTier, SubscriptionStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantResolutionMode } from '../../common/request-context/request-context.service';
import { TenantContextGuard } from '../../tenant-context/guards/tenant-context.guard';
import { TenantContext } from '../../tenant-context/tenant-context.types';
import { BillingService } from '../billing.service';
import { StripeBillingService } from '../services/stripe-billing.service';
import { BillingController } from './billing.controller';

describe('BillingController', () => {
  let controller: BillingController;
  let billingService: { getSubscriptionOverview: jest.Mock };
  let stripeBillingService: {
    createCheckoutSession: jest.Mock;
    createCustomerPortalSession: jest.Mock;
    handleWebhookEvent: jest.Mock;
  };

  const mockTenant: TenantContext = {
    organizationId: 'org-uuid-1',
    membershipId: 'mem-1',
    organizationRole: MembershipRole.OWNER,
    legacyUserRole: UserRole.ADMIN,
    resolutionMode: TenantResolutionMode.EXPLICIT,
    userId: 'user-1',
  };

  beforeEach(async () => {
    billingService = {
      getSubscriptionOverview: jest.fn(),
    };
    stripeBillingService = {
      createCheckoutSession: jest.fn(),
      createCustomerPortalSession: jest.fn(),
      handleWebhookEvent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BillingController],
      providers: [
        { provide: BillingService, useValue: billingService },
        { provide: StripeBillingService, useValue: stripeBillingService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TenantContextGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BillingController>(BillingController);
  });

  describe('getSubscriptionOverview', () => {
    it('returns the organization subscription overview and consumption', async () => {
      const mockOverview = {
        id: 'sub-1',
        organizationId: 'org-uuid-1',
        status: SubscriptionStatus.ACTIVE,
        plan: {
          id: 'plan-1',
          tier: PlanTier.PRO,
          code: 'pro-monthly',
          name: 'Pro Plan',
          basePrice: '999.00',
          currency: 'MXN',
        },
        quotas: {
          maxTherapists: 3,
          maxBranches: 2,
          maxNotificationsPerMonth: 500,
          canCustomBrand: true,
          canTeleconsultation: true,
        },
        usage: {
          therapistsCount: 2,
          branchesCount: 1,
          notificationsCount: 120,
        },
      };

      billingService.getSubscriptionOverview.mockResolvedValue(mockOverview);

      const result = await controller.getSubscriptionOverview(mockTenant);

      expect(result).toEqual(mockOverview);
      expect(billingService.getSubscriptionOverview).toHaveBeenCalledWith(
        'org-uuid-1',
      );
    });
  });

  describe('createCheckoutSession', () => {
    it('delegates to stripeBillingService to generate checkout session URL', async () => {
      const mockResponse = {
        url: 'https://checkout.stripe.com/pay/cs_123',
        sessionId: 'cs_123',
      };
      stripeBillingService.createCheckoutSession.mockResolvedValue(mockResponse);

      const result = await controller.createCheckoutSession(mockTenant, {
        priceId: 'price_pro_mxn',
        successUrl: 'https://app.psicologia.com/billing?success=true',
        cancelUrl: 'https://app.psicologia.com/billing?canceled=true',
      });

      expect(result).toEqual(mockResponse);
      expect(stripeBillingService.createCheckoutSession).toHaveBeenCalledWith(
        'org-uuid-1',
        'price_pro_mxn',
        'https://app.psicologia.com/billing?success=true',
        'https://app.psicologia.com/billing?canceled=true',
      );
    });
  });

  describe('createPortalSession', () => {
    it('delegates to stripeBillingService to generate customer portal session URL', async () => {
      const mockResponse = {
        url: 'https://billing.stripe.com/p/session/portal_123',
      };
      stripeBillingService.createCustomerPortalSession.mockResolvedValue(
        mockResponse,
      );

      const result = await controller.createPortalSession(mockTenant, {
        returnUrl: 'https://app.psicologia.com/billing',
      });

      expect(result).toEqual(mockResponse);
      expect(stripeBillingService.createCustomerPortalSession).toHaveBeenCalledWith(
        'org-uuid-1',
        'https://app.psicologia.com/billing',
      );
    });
  });

  describe('handleWebhook', () => {
    it('delegates rawBody and signature to stripeBillingService', async () => {
      const mockWebhookResult = {
        received: true,
        eventType: 'checkout.session.completed',
      };
      stripeBillingService.handleWebhookEvent.mockResolvedValue(
        mockWebhookResult,
      );

      const mockReq = {
        rawBody: Buffer.from(JSON.stringify({ type: 'checkout.session.completed' })),
      } as any;

      const result = await controller.handleWebhook('sig_123', mockReq);

      expect(result).toEqual(mockWebhookResult);
      expect(stripeBillingService.handleWebhookEvent).toHaveBeenCalledWith(
        'sig_123',
        mockReq.rawBody,
      );
    });
  });
});
