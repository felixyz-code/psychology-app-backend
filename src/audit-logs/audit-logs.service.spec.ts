import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogService } from './audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let prisma: {
    auditLog: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      auditLog: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
  });

  it('creates an audit log entry with complete payload', async () => {
    const mockCreated = {
      id: 'mock-audit-id',
      timestamp: new Date(),
      organizationId: 'org-uuid',
      userId: 'user-uuid',
      action: 'ORGANIZATION_UPDATE',
      resourceType: 'Organization',
      resourceId: 'org-uuid',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      details: { field: 'displayName', oldValue: 'A', newValue: 'B' },
    };

    prisma.auditLog.create.mockResolvedValue(mockCreated);

    const result = await service.create({
      organizationId: 'org-uuid',
      userId: 'user-uuid',
      action: 'ORGANIZATION_UPDATE',
      resourceType: 'Organization',
      resourceId: 'org-uuid',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      details: { field: 'displayName', oldValue: 'A', newValue: 'B' },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-uuid',
        userId: 'user-uuid',
        action: 'ORGANIZATION_UPDATE',
        resourceType: 'Organization',
        resourceId: 'org-uuid',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        details: { field: 'displayName', oldValue: 'A', newValue: 'B' },
      },
    });
    expect(result).toEqual(mockCreated);
  });

  it('handles null optional fields gracefully and sets JsonNull when details is null/undefined', async () => {
    prisma.auditLog.create.mockResolvedValue({
      id: 'mock-audit-id-2',
      timestamp: new Date(),
      organizationId: null,
      userId: null,
      action: 'SYSTEM_EVENT',
      resourceType: 'System',
      resourceId: null,
      ipAddress: null,
      userAgent: null,
      details: null,
    });

    const result = await service.create({
      action: 'SYSTEM_EVENT',
      resourceType: 'System',
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        organizationId: null,
        userId: null,
        action: 'SYSTEM_EVENT',
        resourceType: 'System',
        resourceId: null,
        ipAddress: null,
        userAgent: null,
        details: Prisma.JsonNull,
      },
    });
    expect(result).toBeDefined();
  });

  it('fails gracefully without throwing when database create fails', async () => {
    prisma.auditLog.create.mockRejectedValue(
      new Error('DB Connection Failure'),
    );

    const result = await service.create({
      action: 'FAILED_ACTION',
      resourceType: 'Organization',
    });

    expect(result).toBeNull();
  });

  it('queries audit logs by organization with pagination', async () => {
    const mockList = [
      { id: '1', action: 'ROLE_CHANGE' },
      { id: '2', action: 'SETTINGS_UPDATE' },
    ];
    prisma.auditLog.findMany.mockResolvedValue(mockList);

    const result = await service.findByOrganization('org-uuid', 20);

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-uuid' },
      orderBy: { timestamp: 'desc' },
      take: 20,
      skip: 0,
    });
    expect(result).toEqual(mockList);
  });

  it('queries audit logs by user', async () => {
    const mockList = [{ id: '1', action: 'LOGIN' }];
    prisma.auditLog.findMany.mockResolvedValue(mockList);

    const result = await service.findByUser('user-uuid', 10);

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-uuid' },
      orderBy: { timestamp: 'desc' },
      take: 10,
      skip: 0,
    });
    expect(result).toEqual(mockList);
  });

  it('queries audit log by id', async () => {
    const mockItem = { id: 'item-1', action: 'INVITE_CREATE' };
    prisma.auditLog.findUnique.mockResolvedValue(mockItem);

    const result = await service.findById('item-1');

    expect(prisma.auditLog.findUnique).toHaveBeenCalledWith({
      where: { id: 'item-1' },
    });
    expect(result).toEqual(mockItem);
  });
});
