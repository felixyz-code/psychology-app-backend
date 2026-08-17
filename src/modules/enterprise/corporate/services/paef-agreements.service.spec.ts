import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PaefAgreementStatus } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { PaefAgreementsService } from './paef-agreements.service';

describe('PaefAgreementsService', () => {
  let service: PaefAgreementsService;
  let prisma: any;

  const mockOrgId = 'org-1111-uuid';
  const mockClientId = 'client-1111-uuid';
  const mockAgreementId = 'agreement-1111-uuid';

  beforeEach(async () => {
    prisma = {
      paefAgreement: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      corporateClient: {
        findFirst: jest.fn(),
      },
      branch: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaefAgreementsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PaefAgreementsService>(PaefAgreementsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const validDto = {
      corporateClientId: mockClientId,
      code: 'GLOBEX-2026',
      title: 'Globex Wellness Agreement',
      validFrom: '2026-01-01T00:00:00.000Z',
      validUntil: '2026-12-31T23:59:59.999Z',
      isMultiBranch: true,
      defaultMaxSessionsPerEmployee: 5,
    };

    it('should create agreement successfully', async () => {
      prisma.corporateClient.findFirst.mockResolvedValue({ id: mockClientId });
      prisma.paefAgreement.findUnique.mockResolvedValue(null);
      prisma.paefAgreement.create.mockResolvedValue({
        id: mockAgreementId,
        organizationId: mockOrgId,
        ...validDto,
      });

      const result = await service.create(mockOrgId, validDto);
      expect(result.id).toBe(mockAgreementId);
    });

    it('should throw BadRequestException when validUntil <= validFrom', async () => {
      await expect(
        service.create(mockOrgId, {
          ...validDto,
          validFrom: '2026-12-31T00:00:00.000Z',
          validUntil: '2026-01-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when corporateClient does not exist', async () => {
      prisma.corporateClient.findFirst.mockResolvedValue(null);

      await expect(service.create(mockOrgId, validDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException on duplicate code', async () => {
      prisma.corporateClient.findFirst.mockResolvedValue({ id: mockClientId });
      prisma.paefAgreement.findUnique.mockResolvedValue({ id: 'existing-id' });

      await expect(service.create(mockOrgId, validDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should validate allowed branches when isMultiBranch is false', async () => {
      prisma.corporateClient.findFirst.mockResolvedValue({ id: mockClientId });
      prisma.paefAgreement.findUnique.mockResolvedValue(null);
      prisma.branch.findMany.mockResolvedValue([{ id: 'branch-1' }]);

      await expect(
        service.create(mockOrgId, {
          ...validDto,
          isMultiBranch: false,
          allowedBranchIds: ['branch-1', 'branch-invalid'],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should return list of agreements', async () => {
      prisma.paefAgreement.findMany.mockResolvedValue([
        { id: mockAgreementId, code: 'GLOBEX-2026' },
      ]);

      const result = await service.findAll(mockOrgId);
      expect(result.length).toBe(1);
    });
  });

  describe('findOne', () => {
    it('should return agreement details', async () => {
      prisma.paefAgreement.findFirst.mockResolvedValue({
        id: mockAgreementId,
        code: 'GLOBEX-2026',
        benefitPools: [],
      });

      const result = await service.findOne(mockOrgId, mockAgreementId);
      expect(result.id).toBe(mockAgreementId);
    });
  });

  describe('remove', () => {
    it('should set status to TERMINATED', async () => {
      prisma.paefAgreement.findFirst.mockResolvedValue({ id: mockAgreementId });
      prisma.paefAgreement.update.mockResolvedValue({
        id: mockAgreementId,
        status: PaefAgreementStatus.TERMINATED,
      });

      const result = await service.remove(mockOrgId, mockAgreementId);
      expect(result.status).toBe(PaefAgreementStatus.TERMINATED);
    });
  });
});
