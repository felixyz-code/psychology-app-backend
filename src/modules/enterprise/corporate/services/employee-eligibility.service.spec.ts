import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EmployeeEligibilityStatus, PaefAgreementStatus } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { EmployeeEligibilityService } from './employee-eligibility.service';

describe('EmployeeEligibilityService', () => {
  let service: EmployeeEligibilityService;
  let prisma: any;

  const mockOrgId = 'org-1111-uuid';
  const mockAgreementId = 'agreement-1111-uuid';
  const mockEligibilityId = 'eligibility-1111-uuid';

  beforeEach(async () => {
    prisma = {
      employeeEligibility: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      paefAgreement: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeeEligibilityService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<EmployeeEligibilityService>(
      EmployeeEligibilityService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create employee eligibility record', async () => {
      prisma.paefAgreement.findFirst.mockResolvedValue({
        id: mockAgreementId,
        defaultMaxSessionsPerEmployee: 5,
      });
      prisma.employeeEligibility.findUnique.mockResolvedValue(null);
      prisma.employeeEligibility.create.mockResolvedValue({
        id: mockEligibilityId,
        email: 'employee@globex.com',
        maxSessionsAllowed: 5,
      });

      const result = await service.create(mockOrgId, mockAgreementId, {
        email: 'employee@globex.com',
      });

      expect(result.id).toBe(mockEligibilityId);
    });

    it('should throw ConflictException on duplicate email within agreement', async () => {
      prisma.paefAgreement.findFirst.mockResolvedValue({
        id: mockAgreementId,
        defaultMaxSessionsPerEmployee: 5,
      });
      prisma.employeeEligibility.findUnique.mockResolvedValue({
        id: 'existing-id',
      });

      await expect(
        service.create(mockOrgId, mockAgreementId, {
          email: 'employee@globex.com',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('batchCreate', () => {
    it('should import array of employees and report stats', async () => {
      prisma.paefAgreement.findFirst.mockResolvedValue({
        id: mockAgreementId,
        defaultMaxSessionsPerEmployee: 5,
      });
      prisma.employeeEligibility.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'existing-id' });
      prisma.employeeEligibility.create.mockResolvedValue({ id: 'created-id' });

      const result = await service.batchCreate(mockOrgId, mockAgreementId, {
        employees: [
          { email: 'emp1@globex.com', firstName: 'Alice' },
          { email: 'emp2@globex.com', firstName: 'Bob' },
        ],
      });

      expect(result.importedCount).toBe(1);
      expect(result.skippedCount).toBe(1);
    });
  });

  describe('checkEligibility', () => {
    const validAgreement = {
      id: mockAgreementId,
      status: PaefAgreementStatus.ACTIVE,
      isMultiBranch: true,
      validFrom: new Date('2020-01-01'),
      validUntil: new Date('2030-12-31'),
      corporateClient: {
        id: 'client-1',
        name: 'Globex Corp',
        domainWhitelist: ['@globex.com'],
      },
      benefitPools: [
        {
          id: 'pool-1',
          name: 'Primary Pool',
          totalSessions: 100,
          consumedSessions: 10,
          reservedSessions: 5,
        },
      ],
    };

    it('should return isEligible: true when employee is explicitly in roster with quota', async () => {
      prisma.paefAgreement.findFirst.mockResolvedValue(validAgreement);
      prisma.employeeEligibility.findUnique.mockResolvedValue({
        id: mockEligibilityId,
        email: 'alice@globex.com',
        maxSessionsAllowed: 5,
        consumedSessions: 1,
        reservedSessions: 0,
        status: EmployeeEligibilityStatus.ACTIVE,
      });

      const result = await service.checkEligibility(mockOrgId, {
        agreementId: mockAgreementId,
        email: 'alice@globex.com',
      });

      expect(result.isEligible).toBe(true);
      expect(result.reason).toBe('ELIGIBLE');
    });

    it('should auto-provision and return eligible when domain matches whitelist', async () => {
      prisma.paefAgreement.findFirst.mockResolvedValue(validAgreement);
      prisma.employeeEligibility.findUnique.mockResolvedValue(null);
      prisma.employeeEligibility.create.mockResolvedValue({
        id: 'auto-provisioned-id',
        email: 'newuser@globex.com',
        maxSessionsAllowed: 5,
        consumedSessions: 0,
        reservedSessions: 0,
        status: EmployeeEligibilityStatus.ACTIVE,
      });

      const result = await service.checkEligibility(mockOrgId, {
        agreementId: mockAgreementId,
        email: 'newuser@globex.com',
      });

      expect(result.isEligible).toBe(true);
      expect(prisma.employeeEligibility.create).toHaveBeenCalled();
    });

    it('should return isEligible: false when employee is not in roster and domain is not whitelisted', async () => {
      prisma.paefAgreement.findFirst.mockResolvedValue(validAgreement);
      prisma.employeeEligibility.findUnique.mockResolvedValue(null);

      const result = await service.checkEligibility(mockOrgId, {
        agreementId: mockAgreementId,
        email: 'outsider@gmail.com',
      });

      expect(result.isEligible).toBe(false);
      expect(result.reason).toBe('NOT_IN_ROSTER');
    });

    it('should return isEligible: false when employee has exhausted quota', async () => {
      prisma.paefAgreement.findFirst.mockResolvedValue(validAgreement);
      prisma.employeeEligibility.findUnique.mockResolvedValue({
        id: mockEligibilityId,
        email: 'exhausted@globex.com',
        maxSessionsAllowed: 5,
        consumedSessions: 5,
        reservedSessions: 0,
        status: EmployeeEligibilityStatus.ACTIVE,
      });

      const result = await service.checkEligibility(mockOrgId, {
        agreementId: mockAgreementId,
        email: 'exhausted@globex.com',
      });

      expect(result.isEligible).toBe(false);
      expect(result.reason).toBe('EMPLOYEE_QUOTA_EXHAUSTED');
    });
  });
});
