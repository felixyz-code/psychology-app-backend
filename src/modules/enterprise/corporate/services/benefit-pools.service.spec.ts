import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PaefAgreementStatus } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { BenefitPoolsService } from './benefit-pools.service';

describe('BenefitPoolsService', () => {
  let service: BenefitPoolsService;
  let prisma: any;

  const mockOrgId = 'org-1111-uuid';
  const mockAgreementId = 'agreement-1111-uuid';
  const mockPoolId = 'pool-1111-uuid';

  beforeEach(async () => {
    prisma = {
      benefitPool: {
        findFirst: jest.fn(),
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
        BenefitPoolsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<BenefitPoolsService>(BenefitPoolsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const validDto = {
      name: 'Q1 Pool',
      totalSessions: 100,
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: '2026-03-31T23:59:59.999Z',
    };

    it('should create pool successfully', async () => {
      prisma.paefAgreement.findFirst.mockResolvedValue({
        id: mockAgreementId,
        status: PaefAgreementStatus.ACTIVE,
      });
      prisma.benefitPool.create.mockResolvedValue({
        id: mockPoolId,
        organizationId: mockOrgId,
        agreementId: mockAgreementId,
        ...validDto,
      });

      const result = await service.create(mockOrgId, mockAgreementId, validDto);
      expect(result.id).toBe(mockPoolId);
    });

    it('should reject terminated agreement', async () => {
      prisma.paefAgreement.findFirst.mockResolvedValue({
        id: mockAgreementId,
        status: PaefAgreementStatus.TERMINATED,
      });

      await expect(
        service.create(mockOrgId, mockAgreementId, validDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject when validUntil <= validFrom', async () => {
      prisma.paefAgreement.findFirst.mockResolvedValue({
        id: mockAgreementId,
        status: PaefAgreementStatus.ACTIVE,
      });

      await expect(
        service.create(mockOrgId, mockAgreementId, {
          ...validDto,
          validFrom: '2026-03-31T00:00:00.000Z',
          validUntil: '2026-01-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAllByAgreement', () => {
    it('should return list of pools with calculated metrics', async () => {
      prisma.benefitPool.findMany.mockResolvedValue([
        {
          id: mockPoolId,
          totalSessions: 100,
          consumedSessions: 20,
          reservedSessions: 10,
        },
      ]);

      const result = await service.findAllByAgreement(
        mockOrgId,
        mockAgreementId,
      );
      expect(result.length).toBe(1);
      expect(result[0].availableSessions).toBe(70);
      expect(result[0].utilizationPercentage).toBe(30);
    });
  });

  describe('findOne', () => {
    it('should return pool details with calculations', async () => {
      prisma.benefitPool.findFirst.mockResolvedValue({
        id: mockPoolId,
        totalSessions: 50,
        consumedSessions: 10,
        reservedSessions: 5,
        agreement: { id: mockAgreementId },
      });

      const result = await service.findOne(mockOrgId, mockPoolId);
      expect(result.availableSessions).toBe(35);
      expect(result.utilizationPercentage).toBe(30);
    });

    it('should throw NotFoundException if pool not found', async () => {
      prisma.benefitPool.findFirst.mockResolvedValue(null);

      await expect(service.findOne(mockOrgId, mockPoolId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
