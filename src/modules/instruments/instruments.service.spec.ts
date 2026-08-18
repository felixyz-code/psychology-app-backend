import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InstrumentVersionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { InstrumentsService } from './instruments.service';

describe('InstrumentsService', () => {
  let service: InstrumentsService;
  let prisma: PrismaService;

  const mockOrgId = '22000000-0000-4000-8000-000000000001';
  const mockInstrumentId = '11111111-1111-4000-8000-111111111111';
  const mockVersionId = '22222222-2222-4000-8000-222222222222';

  const mockPrismaService = {
    instrument: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    instrumentVersion: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstrumentsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<InstrumentsService>(InstrumentsService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should query instruments accessible to the tenant (system + tenant custom)', async () => {
      const mockResult = [
        { id: '1', code: 'PHQ-9', isSystem: true, versions: [] },
        {
          id: '2',
          code: 'CUSTOM-1',
          isSystem: false,
          organizationId: mockOrgId,
          versions: [],
        },
      ];
      mockPrismaService.instrument.findMany.mockResolvedValue(mockResult);

      const res = await service.findAll(mockOrgId);

      expect(res).toEqual(mockResult);
      expect(prisma.instrument.findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ isSystem: true }, { organizationId: mockOrgId }],
        },
        include: expect.any(Object),
        orderBy: expect.any(Array),
      });
    });
  });

  describe('create', () => {
    it('should create a custom tenant instrument when code does not conflict', async () => {
      mockPrismaService.instrument.findFirst.mockResolvedValue(null);
      const createdMock = {
        id: mockInstrumentId,
        code: 'GAD-7-CUSTOM',
        name: 'Escala Ansiedad Custom',
        organizationId: mockOrgId,
        isSystem: false,
      };
      mockPrismaService.instrument.create.mockResolvedValue(createdMock);

      const result = await service.create(mockOrgId, {
        code: 'GAD-7-CUSTOM',
        name: 'Escala Ansiedad Custom',
      });

      expect(result).toEqual(createdMock);
      expect(prisma.instrument.create).toHaveBeenCalledWith({
        data: {
          organizationId: mockOrgId,
          code: 'GAD-7-CUSTOM',
          name: 'Escala Ansiedad Custom',
          description: undefined,
          targetPopulation: undefined,
          isSystem: false,
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
    it('should create a new draft version with incremented version number', async () => {
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
    it('should update draft version when status is DRAFT', async () => {
      mockPrismaService.instrumentVersion.findUnique.mockResolvedValue({
        id: mockVersionId,
        status: InstrumentVersionStatus.DRAFT,
        instrument: { organizationId: mockOrgId, isSystem: false },
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
  });

  describe('publishVersion', () => {
    it('should transition DRAFT to PUBLISHED and deprecate older versions', async () => {
      mockPrismaService.instrumentVersion.findUnique.mockResolvedValue({
        id: mockVersionId,
        instrumentId: mockInstrumentId,
        status: InstrumentVersionStatus.DRAFT,
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
  });
});
