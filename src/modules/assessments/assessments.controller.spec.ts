import { Test, TestingModule } from '@nestjs/testing';
import { AdministrationStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import type { TenantContext } from '../../tenant-context/tenant-context.types';
import { AssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';

describe('AssessmentsController', () => {
  let controller: AssessmentsController;
  let service: AssessmentsService;

  const mockTenant: TenantContext = {
    organizationId: 'org-111',
    membershipId: 'mem-111',
    role: 'PSYCHOLOGIST' as any,
    organizationStatus: 'ACTIVE' as any,
    slug: 'clinic-alpha',
    displayName: 'Clínica Alpha',
    timezone: 'UTC',
    locale: 'es-MX',
    currency: 'MXN',
  };

  const mockUser: AuthenticatedUser = {
    id: 'user-111',
    name: 'Terapeuta Test',
    email: 'terapeuta@example.com',
    role: 'PSYCHOLOGIST',
  };

  const mockAssessmentsService = {
    assign: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    saveResponses: jest.fn(),
    complete: jest.fn(),
    findByAccessToken: jest.fn(),
    saveResponsesByAccessToken: jest.fn(),
    completeByAccessToken: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssessmentsController],
      providers: [
        {
          provide: AssessmentsService,
          useValue: mockAssessmentsService,
        },
      ],
    }).compile();

    controller = module.get<AssessmentsController>(AssessmentsController);
    service = module.get<AssessmentsService>(AssessmentsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('assign', () => {
    it('should call service.assign with tenant organizationId, user.id and dto', async () => {
      const dto = {
        patientId: 'pat-1',
        instrumentVersionId: 'ver-1',
      };
      mockAssessmentsService.assign.mockResolvedValue({
        id: 'adm-1',
        status: AdministrationStatus.ASSIGNED,
      });

      const res = await controller.assign(mockTenant, mockUser, dto);

      expect(service.assign).toHaveBeenCalledWith(
        mockTenant.organizationId,
        mockUser.id,
        dto,
      );
      expect(res.id).toBe('adm-1');
    });
  });

  describe('findAll', () => {
    it('should call service.findAll with tenant organizationId and query params', async () => {
      const query = { page: 1, limit: 10 };
      mockAssessmentsService.findAll.mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, limit: 10, totalPages: 1 },
      });

      const res = await controller.findAll(mockTenant, query);

      expect(service.findAll).toHaveBeenCalledWith(
        mockTenant.organizationId,
        query,
      );
      expect(res.data).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should call service.findOne with tenant organizationId and id', async () => {
      mockAssessmentsService.findOne.mockResolvedValue({
        id: 'adm-1',
        status: AdministrationStatus.ASSIGNED,
      });

      const res = await controller.findOne(mockTenant, 'adm-1');

      expect(service.findOne).toHaveBeenCalledWith(
        mockTenant.organizationId,
        'adm-1',
      );
      expect(res.id).toBe('adm-1');
    });
  });

  describe('saveResponses', () => {
    it('should call service.saveResponses with tenant organizationId, id and dto', async () => {
      const dto = { responses: { PHQ9_1: 2 } };
      mockAssessmentsService.saveResponses.mockResolvedValue({
        status: AdministrationStatus.IN_PROGRESS,
        savedCount: 1,
      });

      const res = await controller.saveResponses(mockTenant, 'adm-1', dto);

      expect(service.saveResponses).toHaveBeenCalledWith(
        mockTenant.organizationId,
        'adm-1',
        dto,
      );
      expect(res.status).toBe(AdministrationStatus.IN_PROGRESS);
    });
  });

  describe('complete', () => {
    it('should call service.complete with tenant organizationId and id', async () => {
      mockAssessmentsService.complete.mockResolvedValue({
        id: 'adm-1',
        status: AdministrationStatus.COMPLETED,
        result: { rawScore: 12 },
      });

      const res = await controller.complete(mockTenant, 'adm-1');

      expect(service.complete).toHaveBeenCalledWith(
        mockTenant.organizationId,
        'adm-1',
      );
      expect(res.status).toBe(AdministrationStatus.COMPLETED);
    });
  });

  describe('findPublicRunner', () => {
    it('should call service.findByAccessToken with accessToken', async () => {
      const mockToken = 'sec_eval_123';
      mockAssessmentsService.findByAccessToken.mockResolvedValue({
        id: 'adm-1',
        status: AdministrationStatus.ASSIGNED,
      });

      const res = await controller.findPublicRunner(mockToken);

      expect(service.findByAccessToken).toHaveBeenCalledWith(mockToken);
      expect(res.id).toBe('adm-1');
    });
  });

  describe('savePublicResponses', () => {
    it('should call service.saveResponsesByAccessToken with accessToken and dto', async () => {
      const mockToken = 'sec_eval_123';
      const dto = { responses: { PHQ9_1: 2 } };
      mockAssessmentsService.saveResponsesByAccessToken.mockResolvedValue({
        status: AdministrationStatus.IN_PROGRESS,
        savedCount: 1,
      });

      const res = await controller.savePublicResponses(mockToken, dto);

      expect(service.saveResponsesByAccessToken).toHaveBeenCalledWith(
        mockToken,
        dto,
      );
      expect(res.status).toBe(AdministrationStatus.IN_PROGRESS);
    });
  });

  describe('completePublic', () => {
    it('should call service.completeByAccessToken with accessToken and optional dto', async () => {
      const mockToken = 'sec_eval_123';
      const dto = { responses: { PHQ9_1: 3 } };
      mockAssessmentsService.completeByAccessToken.mockResolvedValue({
        id: 'adm-1',
        status: AdministrationStatus.COMPLETED,
      });

      const res = await controller.completePublic(mockToken, dto);

      expect(service.completeByAccessToken).toHaveBeenCalledWith(
        mockToken,
        dto,
      );
      expect(res.status).toBe(AdministrationStatus.COMPLETED);
    });
  });
});
