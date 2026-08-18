import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AdministrationStatus, InstrumentVersionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ScoringEngineService } from '../instruments/scoring/scoring-engine.service';
import { AssessmentsService } from './assessments.service';

describe('AssessmentsService', () => {
  let service: AssessmentsService;
  let scoringEngine: ScoringEngineService;

  const mockOrgId = '22000000-0000-4000-8000-000000000001';
  const mockProfessionalId = '33000000-0000-4000-8000-000000000002';
  const mockPatientId = '44000000-0000-4000-8000-000000000003';
  const mockVersionId = '55000000-0000-4000-8000-000000000004';
  const mockAdministrationId = '66000000-0000-4000-8000-000000000005';

  const mockPrismaService = {
    patient: {
      findFirst: jest.fn(),
    },
    branch: {
      findFirst: jest.fn(),
    },
    caseFile: {
      findFirst: jest.fn(),
    },
    instrumentVersion: {
      findUnique: jest.fn(),
    },
    assessmentAdministration: {
      create: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    assessmentResponse: {
      upsert: jest.fn(),
      count: jest.fn(),
    },
    assessmentResult: {
      create: jest.fn(),
    },
    $transaction: jest.fn((callbackOrArray) => {
      if (typeof callbackOrArray === 'function') {
        return callbackOrArray(mockPrismaService);
      }
      return Promise.all(callbackOrArray);
    }),
  };

  const mockScoringEngine = {
    calculate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssessmentsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ScoringEngineService, useValue: mockScoringEngine },
      ],
    }).compile();

    service = module.get<AssessmentsService>(AssessmentsService);
    scoringEngine = module.get<ScoringEngineService>(ScoringEngineService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('assign', () => {
    it('should successfully assign an assessment to a patient with generated access token', async () => {
      mockPrismaService.patient.findFirst.mockResolvedValue({
        id: mockPatientId,
        organizationId: mockOrgId,
        caseFile: { id: 'case-1' },
      });

      mockPrismaService.instrumentVersion.findUnique.mockResolvedValue({
        id: mockVersionId,
        status: InstrumentVersionStatus.PUBLISHED,
        instrument: { id: 'inst-1', code: 'PHQ-9', name: 'PHQ-9' },
      });

      mockPrismaService.assessmentAdministration.create.mockResolvedValue({
        id: mockAdministrationId,
        organizationId: mockOrgId,
        patientId: mockPatientId,
        professionalId: mockProfessionalId,
        status: AdministrationStatus.ASSIGNED,
        accessToken: 'sec_eval_abc123',
      });

      const result = await service.assign(mockOrgId, mockProfessionalId, {
        patientId: mockPatientId,
        instrumentVersionId: mockVersionId,
        isRemoteSelfAdministered: true,
      });

      expect(mockPrismaService.patient.findFirst).toHaveBeenCalledWith({
        where: { id: mockPatientId, organizationId: mockOrgId },
        include: { caseFile: true },
      });
      expect(
        mockPrismaService.assessmentAdministration.create,
      ).toHaveBeenCalled();
      expect(result.id).toEqual(mockAdministrationId);
    });

    it('should throw NotFoundException if patient does not exist in tenant', async () => {
      mockPrismaService.patient.findFirst.mockResolvedValue(null);

      await expect(
        service.assign(mockOrgId, mockProfessionalId, {
          patientId: mockPatientId,
          instrumentVersionId: mockVersionId,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if instrument version is not PUBLISHED', async () => {
      mockPrismaService.patient.findFirst.mockResolvedValue({
        id: mockPatientId,
        organizationId: mockOrgId,
        caseFile: null,
      });
      mockPrismaService.instrumentVersion.findUnique.mockResolvedValue({
        id: mockVersionId,
        status: InstrumentVersionStatus.DRAFT,
      });

      await expect(
        service.assign(mockOrgId, mockProfessionalId, {
          patientId: mockPatientId,
          instrumentVersionId: mockVersionId,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should return paginated list of administrations with total and metadata', async () => {
      mockPrismaService.assessmentAdministration.count.mockResolvedValue(1);
      mockPrismaService.assessmentAdministration.findMany.mockResolvedValue([
        {
          id: mockAdministrationId,
          status: AdministrationStatus.ASSIGNED,
          patient: { firstName: 'John' },
        },
      ]);

      const result = await service.findAll(mockOrgId, { page: 1, limit: 10 });

      expect(result.meta.total).toBe(1);
      expect(result.meta.totalPages).toBe(1);
      expect(result.data).toHaveLength(1);
    });
  });

  describe('findOne', () => {
    it('should return administration detail when found', async () => {
      mockPrismaService.assessmentAdministration.findFirst.mockResolvedValue({
        id: mockAdministrationId,
        organizationId: mockOrgId,
        status: AdministrationStatus.ASSIGNED,
        responses: [],
      });

      const result = await service.findOne(mockOrgId, mockAdministrationId);
      expect(result.id).toBe(mockAdministrationId);
    });

    it('should throw NotFoundException when administration does not exist', async () => {
      mockPrismaService.assessmentAdministration.findFirst.mockResolvedValue(
        null,
      );

      await expect(
        service.findOne(mockOrgId, mockAdministrationId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('saveResponses', () => {
    it('should transition status from ASSIGNED to IN_PROGRESS and upsert responses', async () => {
      mockPrismaService.assessmentAdministration.findFirst.mockResolvedValue({
        id: mockAdministrationId,
        organizationId: mockOrgId,
        status: AdministrationStatus.ASSIGNED,
        expiresAt: null,
      });
      mockPrismaService.assessmentResponse.count.mockResolvedValue(2);

      const result = await service.saveResponses(
        mockOrgId,
        mockAdministrationId,
        {
          responses: {
            PHQ9_1: 2,
            PHQ9_2: 1,
          },
        },
      );

      expect(result.status).toBe(AdministrationStatus.IN_PROGRESS);
      expect(result.savedCount).toBe(2);
      expect(result.totalAnswered).toBe(2);
    });

    it('should throw ConflictException if administration is already COMPLETED (immutability rule)', async () => {
      mockPrismaService.assessmentAdministration.findFirst.mockResolvedValue({
        id: mockAdministrationId,
        organizationId: mockOrgId,
        status: AdministrationStatus.COMPLETED,
      });

      await expect(
        service.saveResponses(mockOrgId, mockAdministrationId, {
          responses: { PHQ9_1: 2 },
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if administration is EXPIRED', async () => {
      mockPrismaService.assessmentAdministration.findFirst.mockResolvedValue({
        id: mockAdministrationId,
        organizationId: mockOrgId,
        status: AdministrationStatus.ASSIGNED,
        expiresAt: new Date(Date.now() - 10000),
      });

      await expect(
        service.saveResponses(mockOrgId, mockAdministrationId, {
          responses: { PHQ9_1: 2 },
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('complete', () => {
    it('should calculate score via ScoringEngine and atomically persist result and lock evaluation', async () => {
      mockPrismaService.assessmentAdministration.findFirst.mockResolvedValue({
        id: mockAdministrationId,
        organizationId: mockOrgId,
        status: AdministrationStatus.IN_PROGRESS,
        result: null,
        expiresAt: null,
        instrumentVersion: {
          definitionJson: { items: [{ code: 'PHQ9_1', required: true }] },
          scoringSpecJson: { scoringType: 'SUM' },
        },
        responses: [{ itemCode: 'PHQ9_1', responseValue: 3 }],
      });

      mockScoringEngine.calculate.mockReturnValue({
        rawScore: 3,
        normalizedScore: 33.3,
        strataCode: 'MILD',
        strataTitle: 'Leve',
        strataSeverity: 'MILD',
        subscaleScores: [],
        flags: [],
        isComplete: true,
      });

      mockPrismaService.assessmentResult.create.mockResolvedValue({
        id: 'res-1',
        rawScore: 3,
        normalizedScore: 33.3,
        strataCode: 'MILD',
        strataTitle: 'Leve',
        severity: 'MILD',
      });

      const result = await service.complete(mockOrgId, mockAdministrationId);

      expect(scoringEngine.calculate).toHaveBeenCalled();
      expect(result.status).toBe(AdministrationStatus.COMPLETED);
      expect(result.result.rawScore).toBe(3);
    });

    it('should throw UnprocessableEntityException if assessment is incomplete', async () => {
      mockPrismaService.assessmentAdministration.findFirst.mockResolvedValue({
        id: mockAdministrationId,
        organizationId: mockOrgId,
        status: AdministrationStatus.IN_PROGRESS,
        result: null,
        expiresAt: null,
        instrumentVersion: {
          definitionJson: { items: [{ code: 'PHQ9_1', required: true }] },
          scoringSpecJson: { scoringType: 'SUM' },
        },
        responses: [],
      });

      mockScoringEngine.calculate.mockReturnValue({
        isComplete: false,
        missingRequiredItems: ['PHQ9_1'],
        answeredCount: 0,
        totalRequiredCount: 1,
      });

      await expect(
        service.complete(mockOrgId, mockAdministrationId),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should throw ConflictException if assessment is already completed', async () => {
      mockPrismaService.assessmentAdministration.findFirst.mockResolvedValue({
        id: mockAdministrationId,
        organizationId: mockOrgId,
        status: AdministrationStatus.COMPLETED,
        result: { id: 'res-1' },
      });

      await expect(
        service.complete(mockOrgId, mockAdministrationId),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findByAccessToken', () => {
    const mockToken = 'sec_eval_abcdef123456';

    it('should return runner details for valid access token', async () => {
      mockPrismaService.assessmentAdministration.findUnique.mockResolvedValue({
        id: mockAdministrationId,
        organizationId: mockOrgId,
        status: AdministrationStatus.ASSIGNED,
        accessToken: mockToken,
        patient: { id: mockPatientId, firstName: 'Carlos', lastName: 'Gomez' },
        instrumentVersion: {
          id: mockVersionId,
          versionNumber: 1,
          definitionJson: { items: [{ code: 'PHQ9_1', prompt: 'Item 1' }] },
          instrument: {
            id: 'inst-1',
            code: 'PHQ-9',
            name: 'PHQ-9',
            targetPopulation: 'Adults',
          },
        },
        responses: [
          {
            id: 'resp-1',
            itemCode: 'PHQ9_1',
            responseValue: 2,
            numericWeight: 2,
          },
        ],
        result: null,
        expiresAt: new Date(Date.now() + 86400000),
        startedAt: null,
        completedAt: null,
      });

      const result = await service.findByAccessToken(mockToken);

      expect(result.id).toBe(mockAdministrationId);
      expect(result.patient.firstName).toBe('Carlos');
      expect(result.instrumentVersion.instrument.code).toBe('PHQ-9');
      expect(result.responses).toHaveLength(1);
    });

    it('should throw NotFoundException if access token is not found', async () => {
      mockPrismaService.assessmentAdministration.findUnique.mockResolvedValue(
        null,
      );

      await expect(service.findByAccessToken('invalid_token')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if access token has expired', async () => {
      mockPrismaService.assessmentAdministration.findUnique.mockResolvedValue({
        id: mockAdministrationId,
        organizationId: mockOrgId,
        status: AdministrationStatus.ASSIGNED,
        accessToken: mockToken,
        expiresAt: new Date(Date.now() - 86400000), // in the past
      });

      await expect(service.findByAccessToken(mockToken)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('saveResponsesByAccessToken', () => {
    const mockToken = 'sec_eval_abcdef123456';

    it('should delegate to saveResponses for valid access token', async () => {
      mockPrismaService.assessmentAdministration.findUnique.mockResolvedValue({
        id: mockAdministrationId,
        organizationId: mockOrgId,
        status: AdministrationStatus.ASSIGNED,
      });

      mockPrismaService.assessmentAdministration.findFirst.mockResolvedValue({
        id: mockAdministrationId,
        organizationId: mockOrgId,
        status: AdministrationStatus.ASSIGNED,
      });

      mockPrismaService.assessmentResponse.count.mockResolvedValue(1);

      const result = await service.saveResponsesByAccessToken(mockToken, {
        responses: { PHQ9_1: 2 },
      });

      expect(result.administrationId).toBe(mockAdministrationId);
    });

    it('should throw NotFoundException if token does not exist', async () => {
      mockPrismaService.assessmentAdministration.findUnique.mockResolvedValue(
        null,
      );

      await expect(
        service.saveResponsesByAccessToken('nonexistent', { responses: {} }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('completeByAccessToken', () => {
    it('should throw NotFoundException if token does not exist', async () => {
      mockPrismaService.assessmentAdministration.findUnique.mockResolvedValue(
        null,
      );

      await expect(
        service.completeByAccessToken('nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should save responses if dto is provided before calling complete', async () => {
      mockPrismaService.assessmentAdministration.findUnique.mockResolvedValue({
        id: 'adm-123',
        organizationId: 'org-1',
        status: AdministrationStatus.ASSIGNED,
      });

      const saveSpy = jest
        .spyOn(service, 'saveResponses')
        .mockResolvedValue({} as any);
      const completeSpy = jest
        .spyOn(service, 'complete')
        .mockResolvedValue({ status: AdministrationStatus.COMPLETED } as any);

      const dto = { responses: { PHQ9_1: 2 } };
      const res = await service.completeByAccessToken('token-123', dto);

      expect(saveSpy).toHaveBeenCalledWith('org-1', 'adm-123', dto);
      expect(completeSpy).toHaveBeenCalledWith('org-1', 'adm-123');
      expect(res.status).toBe(AdministrationStatus.COMPLETED);
    });
  });
});
