import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../../prisma/prisma.service';
import { CorporateClientsService } from './corporate-clients.service';

describe('CorporateClientsService', () => {
  let service: CorporateClientsService;
  let prisma: any;

  const mockOrgId = 'org-1111-uuid';
  const mockClientId = 'client-1111-uuid';

  beforeEach(async () => {
    prisma = {
      corporateClient: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CorporateClientsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<CorporateClientsService>(CorporateClientsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a corporate client successfully', async () => {
      prisma.corporateClient.findFirst.mockResolvedValue(null);
      prisma.corporateClient.create.mockResolvedValue({
        id: mockClientId,
        organizationId: mockOrgId,
        name: 'Globex Corp',
        domainWhitelist: ['@globex.com'],
        isActive: true,
      });

      const result = await service.create(mockOrgId, {
        name: 'Globex Corp',
        domainWhitelist: ['@globex.com'],
      });

      expect(result.id).toBe(mockClientId);
      expect(prisma.corporateClient.create).toHaveBeenCalled();
    });

    it('should throw ConflictException on duplicate name', async () => {
      prisma.corporateClient.findFirst.mockResolvedValue({ id: 'existing-id' });

      await expect(
        service.create(mockOrgId, { name: 'Globex Corp' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should return list of active clients', async () => {
      prisma.corporateClient.findMany.mockResolvedValue([
        { id: mockClientId, name: 'Globex Corp', isActive: true },
      ]);

      const result = await service.findAll(mockOrgId);
      expect(result.length).toBe(1);
      expect(prisma.corporateClient.findMany).toHaveBeenCalledWith({
        where: { organizationId: mockOrgId, isActive: true },
        include: { _count: { select: { agreements: true } } },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findOne', () => {
    it('should return client details with agreements', async () => {
      prisma.corporateClient.findFirst.mockResolvedValue({
        id: mockClientId,
        name: 'Globex Corp',
        agreements: [],
      });

      const result = await service.findOne(mockOrgId, mockClientId);
      expect(result.id).toBe(mockClientId);
    });

    it('should throw NotFoundException if not found', async () => {
      prisma.corporateClient.findFirst.mockResolvedValue(null);

      await expect(service.findOne(mockOrgId, mockClientId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update client details', async () => {
      prisma.corporateClient.findFirst
        .mockResolvedValueOnce({ id: mockClientId }) // findOne check
        .mockResolvedValueOnce(null); // conflict check
      prisma.corporateClient.update.mockResolvedValue({
        id: mockClientId,
        name: 'Globex Enterprise',
      });

      const result = await service.update(mockOrgId, mockClientId, {
        name: 'Globex Enterprise',
      });

      expect(result.name).toBe('Globex Enterprise');
    });
  });

  describe('remove', () => {
    it('should soft-deactivate a corporate client', async () => {
      prisma.corporateClient.findFirst.mockResolvedValue({ id: mockClientId });
      prisma.corporateClient.update.mockResolvedValue({
        id: mockClientId,
        isActive: false,
      });

      const result = await service.remove(mockOrgId, mockClientId);
      expect(result.isActive).toBe(false);
    });
  });
});
