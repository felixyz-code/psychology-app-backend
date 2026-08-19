import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InstrumentVersionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { InstrumentsService } from './instruments.service';
import { ScoringEngineService } from './scoring/scoring-engine.service';

describe('InstrumentsService', () => {
  let service: InstrumentsService;
  let prisma: PrismaService;
  let scoringEngine: ScoringEngineService;

  const mockOrgId = '22000000-0000-4000-8000-000000000001';
  const mockInstrumentId = '11111111-1111-4000-8000-111111111111';
  const mockVersionId = '22222222-2222-4000-8000-222222222222';

  const mockPrismaService = {
    instrument: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    tenantInstrumentConfig: {
      upsert: jest.fn(),
    },
    instrumentVersion: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const mockScoringEngine = {
    calculate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstrumentsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ScoringEngineService, useValue: mockScoringEngine },
      ],
    }).compile();

    service = module.get<InstrumentsService>(InstrumentsService);
    prisma = module.get<PrismaService>(PrismaService);
    scoringEngine = module.get<ScoringEngineService>(ScoringEngineService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findClinicalCatalog', () => {
    it('should return only published and tenant-enabled instruments', async () => {
      const mockRaw = [
        {
          id: 'inst-1',
          code: 'PHQ-9',
          isSystem: true,
          tenantConfigs: [{ isEnabled: true }],
          versions: [
            { id: 'v1', versionNumber: 1, status: InstrumentVersionStatus.PUBLISHED },
          ],
        },
        {
          id: 'inst-2',
          code: 'GAD-7',
          isSystem: true,
          tenantConfigs: [{ isEnabled: false }], // Disabled for this tenant
          versions: [
            { id: 'v2', versionNumber: 1, status: InstrumentVersionStatus.PUBLISHED },
          ],
        },
        {
          id: 'inst-3',
          code: 'DRAFT-ONLY',
          isSystem: false,
          tenantConfigs: [],
          versions: [], // No published versions
        },
      ];

      mockPrismaService.instrument.findMany.mockResolvedValue(mockRaw);

      const result = await service.findClinicalCatalog(mockOrgId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('inst-1');
      expect(result[0].isEnabled).toBe(true);
    });
  });

  describe('findManagementCatalog', () => {
    it('should return all stock and custom instruments with administration locks and toggles', async () => {
      const mockRaw = [
        {
          id: 'inst-1',
          code: 'PHQ-9',
          isSystem: true,
          tenantConfigs: [{ isEnabled: true }],
          versions: [
            {
              id: 'v1',
              versionNumber: 1,
              status: InstrumentVersionStatus.PUBLISHED,
              _count: { assessmentAdministrations: 5 },
            },
          ],
        },
      ];

      mockPrismaService.instrument.findMany.mockResolvedValue(mockRaw);

      const result = await service.findManagementCatalog(mockOrgId);

      expect(result).toHaveLength(1);
      expect(result[0].isEnabled).toBe(true);
      expect(result[0].hasActiveAdministrations).toBe(true);
      expect(result[0].versions[0].isLocked).toBe(true);
    });
  });

  describe('toggleVisibility', () => {
    it('should upsert tenantInstrumentConfig when instrument exists', async () => {
      mockPrismaService.instrument.findFirst.mockResolvedValue({
        id: mockInstrumentId,
        isSystem: true,
      });

      mockPrismaService.tenantInstrumentConfig.upsert.mockResolvedValue({
        instrumentId: mockInstrumentId,
        organizationId: mockOrgId,
        isEnabled: false,
        updatedAt: new Date(),
      });

      const res = await service.toggleVisibility(mockOrgId, mockInstrumentId, false);

      expect(res.isEnabled).toBe(false);
      expect(prisma.tenantInstrumentConfig.upsert).toHaveBeenCalledWith({
        where: {
          organizationId_instrumentId: {
            organizationId: mockOrgId,
            instrumentId: mockInstrumentId,
          },
        },
        create: {
          organizationId: mockOrgId,
          instrumentId: mockInstrumentId,
          isEnabled: false,
        },
        update: {
          isEnabled: false,
        },
      });
    });

    it('should throw NotFoundException if instrument is not accessible', async () => {
      mockPrismaService.instrument.findFirst.mockResolvedValue(null);

      await expect(
        service.toggleVisibility(mockOrgId, 'non-existent', true),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a custom tenant instrument and enable visibility', async () => {
      mockPrismaService.instrument.findFirst.mockResolvedValue(null);
      const createdMock = {
        id: mockInstrumentId,
        code: 'BAI-CUSTOM',
        name: 'Inventario Ansiedad Beck Custom',
        organizationId: mockOrgId,
        isSystem: false,
      };
      mockPrismaService.instrument.create.mockResolvedValue(createdMock);

      const result = await service.create(mockOrgId, {
        code: 'BAI-CUSTOM',
        name: 'Inventario Ansiedad Beck Custom',
      });

      expect(result).toEqual(createdMock);
      expect(prisma.instrument.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: mockOrgId,
          code: 'BAI-CUSTOM',
          name: 'Inventario Ansiedad Beck Custom',
          isSystem: false,
        }),
        include: {
          versions: true,
          tenantConfigs: true,
        },
      });
    });

    it('should throw ConflictException if instrument code exists in tenant', async () => {
      mockPrismaService.instrument.findFirst.mockResolvedValue({
        id: 'existing-id',
      });

      await expect(
        service.create(mockOrgId, { code: 'EXISTING_CODE', name: 'Dup' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('createVersion', () => {
    it('should create a new draft version with incremented version number (vN+1)', async () => {
      mockPrismaService.instrument.findFirst.mockResolvedValue({
        id: mockInstrumentId,
        organizationId: mockOrgId,
        isSystem: false,
        versions: [{ versionNumber: 1 }],
      });

      const newVersionMock = {
        id: mockVersionId,
        instrumentId: mockInstrumentId,
        versionNumber: 2,
        status: InstrumentVersionStatus.DRAFT,
      };
      mockPrismaService.instrumentVersion.create.mockResolvedValue(
        newVersionMock,
      );

      const dto = {
        definitionJson: { items: [] },
        scoringSpecJson: { strata: [] },
      };

      const result = await service.createVersion(
        mockOrgId,
        mockInstrumentId,
        dto,
      );

      expect(result).toEqual(newVersionMock);
      expect(prisma.instrumentVersion.create).toHaveBeenCalledWith({
        data: {
          instrumentId: mockInstrumentId,
          versionNumber: 2,
          status: InstrumentVersionStatus.DRAFT,
          definitionJson: dto.definitionJson,
          scoringSpecJson: dto.scoringSpecJson,
        },
      });
    });
  });

  describe('updateDraftVersion & Immutability Enforcement', () => {
    it('should update draft version when status is DRAFT and has 0 administrations', async () => {
      mockPrismaService.instrumentVersion.findUnique.mockResolvedValue({
        id: mockVersionId,
        status: InstrumentVersionStatus.DRAFT,
        instrument: { organizationId: mockOrgId, isSystem: false },
        _count: { assessmentAdministrations: 0 },
      });
      mockPrismaService.instrumentVersion.update.mockResolvedValue({
        id: mockVersionId,
        status: InstrumentVersionStatus.DRAFT,
      });

      const dto = {
        definitionJson: { updated: true },
        scoringSpecJson: { updated: true },
      };

      const result = await service.updateDraftVersion(
        mockOrgId,
        mockVersionId,
        dto,
      );

      expect(result).toBeDefined();
      expect(prisma.instrumentVersion.update).toHaveBeenCalledWith({
        where: { id: mockVersionId },
        data: dto,
      });
    });

    it('should THROW ForbiddenException when attempting to update a PUBLISHED version (Immutability Gate)', async () => {
      mockPrismaService.instrumentVersion.findUnique.mockResolvedValue({
        id: mockVersionId,
        status: InstrumentVersionStatus.PUBLISHED,
        instrument: { organizationId: mockOrgId, isSystem: false },
        _count: { assessmentAdministrations: 0 },
      });

      const dto = {
        definitionJson: { hack: true },
        scoringSpecJson: { hack: true },
      };

      await expect(
        service.updateDraftVersion(mockOrgId, mockVersionId, dto),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.instrumentVersion.update).not.toHaveBeenCalled();
    });

    it('should THROW ForbiddenException when version has prior administrations', async () => {
      mockPrismaService.instrumentVersion.findUnique.mockResolvedValue({
        id: mockVersionId,
        status: InstrumentVersionStatus.DRAFT,
        instrument: { organizationId: mockOrgId, isSystem: false },
        _count: { assessmentAdministrations: 2 },
      });

      const dto = {
        definitionJson: { edit: true },
        scoringSpecJson: { edit: true },
      };

      await expect(
        service.updateDraftVersion(mockOrgId, mockVersionId, dto),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('publishVersion', () => {
    it('should transition DRAFT to PUBLISHED and deprecate older versions', async () => {
      mockPrismaService.instrumentVersion.findUnique.mockResolvedValue({
        id: mockVersionId,
        instrumentId: mockInstrumentId,
        status: InstrumentVersionStatus.DRAFT,
        definitionJson: {
          items: [{ code: 'Q1', prompt: 'Sample prompt' }],
        },
        instrument: { organizationId: mockOrgId, isSystem: false },
      });
      mockPrismaService.instrumentVersion.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrismaService.instrumentVersion.update.mockResolvedValue({
        id: mockVersionId,
        status: InstrumentVersionStatus.PUBLISHED,
      });

      const result = await service.publishVersion(mockOrgId, mockVersionId);

      expect(result.status).toEqual(InstrumentVersionStatus.PUBLISHED);
      expect(prisma.instrumentVersion.updateMany).toHaveBeenCalledWith({
        where: {
          instrumentId: mockInstrumentId,
          status: InstrumentVersionStatus.PUBLISHED,
        },
        data: {
          status: InstrumentVersionStatus.DEPRECATED,
        },
      });
    });

    it('should throw UnprocessableEntityException if instrument has 0 items', async () => {
      mockPrismaService.instrumentVersion.findUnique.mockResolvedValue({
        id: mockVersionId,
        instrumentId: mockInstrumentId,
        status: InstrumentVersionStatus.DRAFT,
        definitionJson: { items: [] },
        instrument: { organizationId: mockOrgId, isSystem: false },
      });

      await expect(
        service.publishVersion(mockOrgId, mockVersionId),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('deprecateVersion', () => {
    it('should set version status to DEPRECATED', async () => {
      mockPrismaService.instrumentVersion.findUnique.mockResolvedValue({
        id: mockVersionId,
        instrument: { organizationId: mockOrgId, isSystem: false },
      });
      mockPrismaService.instrumentVersion.update.mockResolvedValue({
        id: mockVersionId,
        status: InstrumentVersionStatus.DEPRECATED,
      });

      const res = await service.deprecateVersion(mockOrgId, mockVersionId);

      expect(res.status).toBe(InstrumentVersionStatus.DEPRECATED);
      expect(prisma.instrumentVersion.update).toHaveBeenCalledWith({
        where: { id: mockVersionId },
        data: { status: InstrumentVersionStatus.DEPRECATED },
      });
    });
  });

  describe('calculateScoreForVersion', () => {
    it('should retrieve version and delegate computation to ScoringEngineService', async () => {
      const mockVersion = {
        id: mockVersionId,
        definitionJson: { items: [] },
        scoringSpecJson: { strata: [] },
        instrument: { isSystem: true, organizationId: null },
      };
      mockPrismaService.instrumentVersion.findUnique.mockResolvedValue(
        mockVersion,
      );

      const expectedScoringResult = {
        rawScore: 10,
        normalizedScore: 50,
        isComplete: true,
      };
      mockScoringEngine.calculate.mockReturnValue(expectedScoringResult);

      const responses = { Q1: 1 };
      const res = await service.calculateScoreForVersion(
        mockOrgId,
        mockVersionId,
        responses,
      );

      expect(res).toEqual(expectedScoringResult);
      expect(scoringEngine.calculate).toHaveBeenCalledWith(
        mockVersion.definitionJson,
        mockVersion.scoringSpecJson,
        responses,
      );
    });
  });
});
