import { Test, TestingModule } from '@nestjs/testing';
import { CorporateController } from './corporate.controller';
import { CorporateClientsService } from './services/corporate-clients.service';
import { PaefAgreementsService } from './services/paef-agreements.service';
import { BenefitPoolsService } from './services/benefit-pools.service';
import { EmployeeEligibilityService } from './services/employee-eligibility.service';
import { BenefitDebitService } from './services/benefit-debit.service';
import { MembershipRole, UserRole } from '@prisma/client';
import {
  TenantContext,
  TenantResolutionMode,
} from '../../../common/request-context/request-context.service';

describe('CorporateController', () => {
  let controller: CorporateController;
  let clientsService: any;
  let agreementsService: any;
  let poolsService: any;
  let eligibilityService: any;
  let debitService: any;

  const mockTenant: TenantContext = {
    organizationId: 'org-1111-uuid',
    userId: 'user-1111-uuid',
    membershipId: 'membership-1111-uuid',
    organizationRole: MembershipRole.ADMIN,
    legacyUserRole: UserRole.ADMIN,
    resolutionMode: TenantResolutionMode.EXPLICIT,
  };

  beforeEach(async () => {
    clientsService = {
      create: jest.fn().mockResolvedValue({ id: 'client-1' }),
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'client-1' }),
      update: jest.fn().mockResolvedValue({ id: 'client-1' }),
      remove: jest.fn().mockResolvedValue({ id: 'client-1' }),
    };

    agreementsService = {
      create: jest.fn().mockResolvedValue({ id: 'agreement-1' }),
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'agreement-1' }),
      update: jest.fn().mockResolvedValue({ id: 'agreement-1' }),
      remove: jest.fn().mockResolvedValue({ id: 'agreement-1' }),
    };

    poolsService = {
      create: jest.fn().mockResolvedValue({ id: 'pool-1' }),
      findAllByAgreement: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'pool-1' }),
      update: jest.fn().mockResolvedValue({ id: 'pool-1' }),
    };

    eligibilityService = {
      create: jest.fn().mockResolvedValue({ id: 'eligibility-1' }),
      batchCreate: jest.fn().mockResolvedValue({ importedCount: 2 }),
      findAllByAgreement: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'eligibility-1' }),
      update: jest.fn().mockResolvedValue({ id: 'eligibility-1' }),
      remove: jest.fn().mockResolvedValue({ id: 'eligibility-1' }),
      checkEligibility: jest.fn().mockResolvedValue({ isEligible: true }),
    };

    debitService = {
      reserveBenefitSession: jest
        .fn()
        .mockResolvedValue({ debitLog: { status: 'RESERVED' } }),
      confirmBenefitSession: jest
        .fn()
        .mockResolvedValue({ debitLog: { status: 'CONFIRMED' } }),
      releaseOrRefundBenefitSession: jest
        .fn()
        .mockResolvedValue({ debitLog: { status: 'RELEASED' } }),
      getDebitLogs: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CorporateController],
      providers: [
        { provide: CorporateClientsService, useValue: clientsService },
        { provide: PaefAgreementsService, useValue: agreementsService },
        { provide: BenefitPoolsService, useValue: poolsService },
        { provide: EmployeeEligibilityService, useValue: eligibilityService },
        { provide: BenefitDebitService, useValue: debitService },
      ],
    }).compile();

    controller = module.get<CorporateController>(CorporateController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should create client', async () => {
    const result = await controller.createClient(mockTenant, {
      name: 'Globex Corp',
    });
    expect(result.id).toBe('client-1');
    expect(clientsService.create).toHaveBeenCalledWith(
      mockTenant.organizationId,
      { name: 'Globex Corp' },
    );
  });

  it('should reserve session', async () => {
    const result = await controller.reserveSession(mockTenant, {
      agreementId: 'agreement-1',
      poolId: 'pool-1',
      eligibilityId: 'eligibility-1',
    });
    expect(result.debitLog.status).toBe('RESERVED');
    expect(debitService.reserveBenefitSession).toHaveBeenCalledWith(
      mockTenant.organizationId,
      {
        agreementId: 'agreement-1',
        poolId: 'pool-1',
        eligibilityId: 'eligibility-1',
      },
      mockTenant.userId,
    );
  });

  it('should check eligibility', async () => {
    const result = await controller.checkEligibility(mockTenant, {
      agreementId: 'agreement-1',
      email: 'john@globex.com',
    });
    expect(result.isEligible).toBe(true);
  });
});
