import { Test, TestingModule } from '@nestjs/testing';
import { MembershipRole, UserRole } from '@prisma/client';
import { TenantResolutionMode } from '../../common/request-context/request-context.service';
import { InstrumentsController } from './instruments.controller';
import { InstrumentsService } from './instruments.service';
import type { TenantContext } from '../../tenant-context/tenant-context.types';

describe('InstrumentsController', () => {
  let controller: InstrumentsController;
  let service: InstrumentsService;

  const mockTenant: TenantContext = {
    organizationId: '22000000-0000-4000-8000-000000000001',
    userId: '23000000-0000-4000-8000-000000000001',
    membershipId: '24000000-0000-4000-8000-000000000001',
    organizationRole: MembershipRole.OWNER,
    legacyUserRole: UserRole.PSYCHOLOGIST,
    resolutionMode: TenantResolutionMode.EXPLICIT,
  };

  const mockService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    createVersion: jest.fn(),
    getVersionDetails: jest.fn(),
    updateDraftVersion: jest.fn(),
    publishVersion: jest.fn(),
    calculateScoreForVersion: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InstrumentsController],
      providers: [{ provide: InstrumentsService, useValue: mockService }],
    }).compile();

    controller = module.get<InstrumentsController>(InstrumentsController);
    service = module.get<InstrumentsService>(InstrumentsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should delegate to service.findAll', async () => {
      mockService.findAll.mockResolvedValue([]);
      await controller.findAll(mockTenant);
      expect(service.findAll).toHaveBeenCalledWith(mockTenant.organizationId);
    });
  });

  describe('create', () => {
    it('should delegate to service.create', async () => {
      const dto = { code: 'TEST', name: 'Test Instrument' };
      mockService.create.mockResolvedValue({ id: 'inst-1', ...dto });
      await controller.create(mockTenant, dto);
      expect(service.create).toHaveBeenCalledWith(
        mockTenant.organizationId,
        dto,
      );
    });
  });

  describe('createVersion', () => {
    it('should delegate to service.createVersion', async () => {
      const dto = { definitionJson: {}, scoringSpecJson: {} };
      mockService.createVersion.mockResolvedValue({ id: 'ver-1' });
      await controller.createVersion(mockTenant, 'inst-1', dto);
      expect(service.createVersion).toHaveBeenCalledWith(
        mockTenant.organizationId,
        'inst-1',
        dto,
      );
    });
  });

  describe('publishVersion', () => {
    it('should delegate to service.publishVersion', async () => {
      mockService.publishVersion.mockResolvedValue({
        id: 'ver-1',
        status: 'PUBLISHED',
      });
      await controller.publishVersion(mockTenant, 'ver-1');
      expect(service.publishVersion).toHaveBeenCalledWith(
        mockTenant.organizationId,
        'ver-1',
      );
    });
  });

  describe('calculateScore', () => {
    it('should delegate to service.calculateScoreForVersion', async () => {
      const responses = { PHQ9_Q1: '2' };
      const expectedResult = { rawScore: 2, isComplete: false };
      mockService.calculateScoreForVersion.mockResolvedValue(expectedResult);

      const result = await controller.calculateScore(
        mockTenant,
        '22222222-2222-4000-8000-222222222222',
        responses,
      );

      expect(result).toEqual(expectedResult);
      expect(service.calculateScoreForVersion).toHaveBeenCalledWith(
        mockTenant.organizationId,
        '22222222-2222-4000-8000-222222222222',
        responses,
      );
    });
  });
});
