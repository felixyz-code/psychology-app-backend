import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogService } from './audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { AuditSeverity } from './audit-logs.types';

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

  it('creates an audit log entry with complete payload including branchId, severity and forensic metrics', async () => {
    const mockCreated = {
      id: 'mock-audit-id',
      timestamp: new Date(),
      organizationId: 'org-uuid',
      branchId: 'branch-uuid',
      userId: 'user-uuid',
      action: 'CLINICAL_PATIENT_READ',
      resourceType: 'Patient',
      resourceId: 'patient-uuid',
      severity: AuditSeverity.INFO,
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
      severity: AuditSeverity.INFO,
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
        severity: AuditSeverity.INFO,
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

  describe('resolveSeverity', () => {
    it('returns explicitly specified severity when present', () => {
      expect(
        service.resolveSeverity({
          severity: AuditSeverity.CRITICAL,
          statusCode: 200,
          action: 'READ',
        }),
      ).toBe(AuditSeverity.CRITICAL);
    });

    it('infers CRITICAL severity for 5xx errors or critical action keywords', () => {
      expect(
        service.resolveSeverity({ statusCode: 500, action: 'GET_PATIENT' }),
      ).toBe(AuditSeverity.CRITICAL);
      expect(
        service.resolveSeverity({
          statusCode: 200,
          action: 'SECURITY_BREACH_DETECTED',
        }),
      ).toBe(AuditSeverity.CRITICAL);
    });

    it('infers HIGH severity for 4xx status or destructive actions', () => {
      expect(
        service.resolveSeverity({ statusCode: 403, action: 'PATIENT_READ' }),
      ).toBe(AuditSeverity.HIGH);
      expect(
        service.resolveSeverity({
          statusCode: 200,
          action: 'PATIENT_RECORD_DELETE',
        }),
      ).toBe(AuditSeverity.HIGH);
      expect(
        service.resolveSeverity({
          statusCode: 200,
          action: 'MEMBERSHIP_REVOKE',
        }),
      ).toBe(AuditSeverity.HIGH);
    });

    it('infers MEDIUM severity for create/update/mutation actions', () => {
      expect(
        service.resolveSeverity({
          statusCode: 200,
          action: 'CLINICAL_NOTE_CREATE',
        }),
      ).toBe(AuditSeverity.MEDIUM);
      expect(
        service.resolveSeverity({
          statusCode: 200,
          action: 'PATIENT_PROFILE_UPDATE',
        }),
      ).toBe(AuditSeverity.MEDIUM);
    });

    it('infers INFO severity for standard read/query actions', () => {
      expect(
        service.resolveSeverity({
          statusCode: 200,
          action: 'PATIENT_LIST_READ',
        }),
      ).toBe(AuditSeverity.INFO);
    });
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
      severity: AuditSeverity.INFO,
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
        severity: AuditSeverity.INFO,
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

  it('queries audit logs with filters, search, severity and aliases', async () => {
    const mockLogs = [
      {
        id: 'log-1',
        action: 'CLINICAL_PATIENT_READ',
        resourceType: 'Patient',
        severity: AuditSeverity.INFO,
      },
    ];
    prisma.auditLog.findMany.mockResolvedValue(mockLogs);
    prisma.auditLog.count.mockResolvedValue(1);

    const fromDate = new Date('2026-08-01');
    const toDate = new Date('2026-08-31');

    const result = await service.findAll({
      tenantId: 'org-1',
      branchId: 'branch-1',
      action: 'CLINICAL_PATIENT_READ',
      resource: 'Patient',
      severity: AuditSeverity.INFO,
      search: 'patient',
      startDate: fromDate,
      endDate: toDate,
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

  describe('exportLogs', () => {
    it('exports audit logs as CSV formatted string with headers', async () => {
      const mockTimestamp = new Date('2026-08-19T12:00:00.000Z');
      const mockItems = [
        {
          id: 'log-101',
          timestamp: mockTimestamp,
          organizationId: 'org-1',
          branchId: 'branch-1',
          userId: 'user-1',
          action: 'DELETE_PATIENT',
          resourceType: 'Patient',
          resourceId: 'patient-99',
          severity: AuditSeverity.HIGH,
          ipAddress: '127.0.0.1',
          userAgent: 'TestAgent/1.0',
          statusCode: 200,
          executionTimeMs: 42,
          actorRole: 'OWNER',
          details: { reason: 'patient request' },
          user: { name: 'Dr. Test', email: 'test@example.com' },
          branch: { name: 'Central Branch', code: 'CEN' },
        },
      ];

      prisma.auditLog.findMany.mockResolvedValue(mockItems);
      prisma.auditLog.count.mockResolvedValue(1);

      const exportResult = await service.exportLogs(
        { organizationId: 'org-1' },
        'csv',
      );

      expect(exportResult.contentType).toContain('text/csv');
      expect(exportResult.filename).toContain('.csv');
      expect(exportResult.data).toContain('ID,Timestamp (UTC)');
      expect(exportResult.data).toContain('log-101');
      expect(exportResult.data).toContain('DELETE_PATIENT');
      expect(exportResult.data).toContain('HIGH');
      expect(exportResult.data).toContain('Central Branch');
    });

    it('exports audit logs as JSON formatted string', async () => {
      const mockItems = [
        {
          id: 'log-102',
          action: 'SESSION_NOTE_CREATE',
          severity: AuditSeverity.MEDIUM,
        },
      ];

      prisma.auditLog.findMany.mockResolvedValue(mockItems);
      prisma.auditLog.count.mockResolvedValue(1);

      const exportResult = await service.exportLogs(
        { organizationId: 'org-1' },
        'json',
      );

      expect(exportResult.contentType).toBe('application/json');
      expect(exportResult.filename).toContain('.json');
      const parsed = JSON.parse(exportResult.data);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe('log-102');
    });
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
