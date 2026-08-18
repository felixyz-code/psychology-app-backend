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
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      auditLog: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
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

  it('creates an audit log entry with complete payload including branchId and forensic metrics', async () => {
    const mockCreated = {
      id: 'mock-audit-id',
      timestamp: new Date(),
      organizationId: 'org-uuid',
      branchId: 'branch-uuid',
      userId: 'user-uuid',
      action: 'CLINICAL_PATIENT_READ',
      resourceType: 'Patient',
      resourceId: 'patient-uuid',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      statusCode: 200,
      executionTimeMs: 15,
      actorRole: 'OWNER',
      details: { field: 'displayName' },
    };

    prisma.auditLog.create.mockResolvedValue(mockCreated);

    const result = await service.create({
      organizationId: 'org-uuid',
      branchId: 'branch-uuid',
      userId: 'user-uuid',
      action: 'CLINICAL_PATIENT_READ',
      resourceType: 'Patient',
      resourceId: 'patient-uuid',
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      statusCode: 200,
      executionTimeMs: 15,
      actorRole: 'OWNER',
      details: { field: 'displayName' },
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-uuid',
        branchId: 'branch-uuid',
        userId: 'user-uuid',
        action: 'CLINICAL_PATIENT_READ',
        resourceType: 'Patient',
        resourceId: 'patient-uuid',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        statusCode: 200,
        executionTimeMs: 15,
        actorRole: 'OWNER',
        details: { field: 'displayName' },
      },
    });
    expect(result).toEqual(mockCreated);
  });

  it('handles null optional fields gracefully and sets JsonNull when details is null/undefined', async () => {
    prisma.auditLog.create.mockResolvedValue({
      id: 'mock-audit-id-2',
      timestamp: new Date(),
      organizationId: null,
      branchId: null,
      userId: null,
      action: 'SYSTEM_EVENT',
      resourceType: 'System',
      resourceId: null,
      ipAddress: null,
      userAgent: null,
      statusCode: null,
      executionTimeMs: null,
      actorRole: null,
      details: null,
    });

    const result = await service.create({
      action: 'SYSTEM_EVENT',
      resourceType: 'System',
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        organizationId: null,
        branchId: null,
        userId: null,
        action: 'SYSTEM_EVENT',
        resourceType: 'System',
        resourceId: null,
        ipAddress: null,
        userAgent: null,
        statusCode: null,
        executionTimeMs: null,
        actorRole: null,
        details: Prisma.JsonNull,
      },
    });
    expect(result).toBeDefined();
  });

  it('returns null and does not throw on prisma error during create', async () => {
    prisma.auditLog.create.mockRejectedValue(new Error('DB connection failed'));

    const result = await service.create({
      action: 'CLINICAL_PATIENT_READ',
      resourceType: 'Patient',
    });

    expect(result).toBeNull();
  });

  it('queries audit logs with filters, search and pagination', async () => {
    const mockLogs = [
      { id: 'log-1', action: 'CLINICAL_PATIENT_READ', resourceType: 'Patient' },
    ];
    prisma.auditLog.findMany.mockResolvedValue(mockLogs);
    prisma.auditLog.count.mockResolvedValue(1);

    const fromDate = new Date('2026-08-01');
    const toDate = new Date('2026-08-31');

    const result = await service.findAll({
      organizationId: 'org-1',
      branchId: 'branch-1',
      action: 'CLINICAL_PATIENT_READ',
      resourceType: 'Patient',
      search: 'patient',
      from: fromDate,
      to: toDate,
      limit: 25,
      offset: 0,
    });

    expect(prisma.auditLog.findMany).toHaveBeenCalled();
    expect(prisma.auditLog.count).toHaveBeenCalled();
    expect(result.items).toEqual(mockLogs);
    expect(result.total).toBe(1);
    expect(result.limit).toBe(25);
    expect(result.offset).toBe(0);
  });

  it('finds single audit log by ID and organizationId', async () => {
    const mockLog = { id: 'log-1', action: 'CLINICAL_PATIENT_READ' };
    prisma.auditLog.findFirst.mockResolvedValue(mockLog);

    const result = await service.findById('log-1', 'org-1');
    expect(prisma.auditLog.findFirst).toHaveBeenCalledWith({
      where: { id: 'log-1', organizationId: 'org-1' },
      include: expect.any(Object),
    });
    expect(result).toEqual(mockLog);
  });
});
