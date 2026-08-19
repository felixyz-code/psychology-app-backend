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
    findClinicalCatalog: jest.fn(),
    findManagementCatalog: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    toggleVisibility: jest.fn(),
    createVersion: jest.fn(),
    getVersionDetails: jest.fn(),
    updateDraftVersion: jest.fn(),
    publishVersion: jest.fn(),
    deprecateVersion: jest.fn(),
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

  describe('findClinicalCatalog', () => {
    it('should delegate to service.findClinicalCatalog', async () => {
      mockService.findClinicalCatalog.mockResolvedValue([]);
      await controller.findClinicalCatalog(mockTenant);
      expect(service.findClinicalCatalog).toHaveBeenCalledWith(
        mockTenant.organizationId,
      );
    });
  });

  describe('findManagementCatalog', () => {
    it('should delegate to service.findManagementCatalog', async () => {
      mockService.findManagementCatalog.mockResolvedValue([]);
      await controller.findManagementCatalog(mockTenant);
      expect(service.findManagementCatalog).toHaveBeenCalledWith(
        mockTenant.organizationId,
      );
    });
  });

  describe('createManagementInstrument', () => {
    it('should delegate to service.create', async () => {
      const dto = { code: 'TEST', name: 'Test Instrument' };
      mockService.create.mockResolvedValue({ id: 'inst-1', ...dto });
      await controller.createManagementInstrument(mockTenant, dto);
      expect(service.create).toHaveBeenCalledWith(
        mockTenant.organizationId,
        dto,
      );
    });
  });

  describe('toggleVisibility', () => {
    it('should delegate to service.toggleVisibility', async () => {
      mockService.toggleVisibility.mockResolvedValue({ isEnabled: false });
      await controller.toggleVisibility(mockTenant, 'inst-1', { isEnabled: false });
      expect(service.toggleVisibility).toHaveBeenCalledWith(
        mockTenant.organizationId,
        'inst-1',
        false,
      );
    });
  });

  describe('createManagementVersion', () => {
    it('should delegate to service.createVersion', async () => {
      const dto = { definitionJson: {}, scoringSpecJson: {} };
      mockService.createVersion.mockResolvedValue({ id: 'ver-1' });
      await controller.createManagementVersion(mockTenant, 'inst-1', dto);
      expect(service.createVersion).toHaveBeenCalledWith(
        mockTenant.organizationId,
        'inst-1',
        dto,
      );
    });
  });

  describe('putManagementDraftVersion', () => {
    it('should delegate to service.updateDraftVersion', async () => {
      const dto = { definitionJson: {}, scoringSpecJson: {} };
      mockService.updateDraftVersion.mockResolvedValue({ id: 'ver-1' });
      await controller.putManagementDraftVersion(mockTenant, 'ver-1', dto);
      expect(service.updateDraftVersion).toHaveBeenCalledWith(
        mockTenant.organizationId,
        'ver-1',
        dto,
      );
    });
  });

  describe('publishManagementVersion', () => {
    it('should delegate to service.publishVersion', async () => {
      mockService.publishVersion.mockResolvedValue({
        id: 'ver-1',
        status: 'PUBLISHED',
      });
      await controller.publishManagementVersion(mockTenant, 'ver-1');
      expect(service.publishVersion).toHaveBeenCalledWith(
        mockTenant.organizationId,
        'ver-1',
      );
    });
  });

  describe('deprecateManagementVersion', () => {
    it('should delegate to service.deprecateVersion', async () => {
      mockService.deprecateVersion.mockResolvedValue({
        id: 'ver-1',
        status: 'DEPRECATED',
      });
      await controller.deprecateManagementVersion(mockTenant, 'ver-1');
      expect(service.deprecateVersion).toHaveBeenCalledWith(
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
