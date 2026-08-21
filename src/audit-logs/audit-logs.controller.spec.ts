import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogService } from './audit-logs.service';
import { CapabilitiesGuard } from '../tenant-context/authorization/capabilities.guard';
import { TenantContextGuard } from '../tenant-context/guards/tenant-context.guard';
import {
  TenantContext,
  TenantResolutionMode,
} from '../common/request-context/request-context.service';
import { MembershipRole, UserRole } from '@prisma/client';
import { AuditSeverity } from './audit-logs.types';
import type { Response } from 'express';

describe('AuditLogsController', () => {
  let controller: AuditLogsController;
  let service: {
    findAll: jest.Mock;
    findById: jest.Mock;
    exportLogs: jest.Mock;
  };

  const mockTenant: TenantContext = {
    userId: 'user-owner-1',
    organizationId: 'org-uuid-1',
    membershipId: 'mem-1',
    organizationRole: MembershipRole.OWNER,
    legacyUserRole: UserRole.ADMIN,
    resolutionMode: TenantResolutionMode.EXPLICIT,
  };

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      findById: jest.fn(),
      exportLogs: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditLogsController],
      providers: [
        {
          provide: AuditLogService,
          useValue: service,
        },
      ],
    })
      .overrideGuard(CapabilitiesGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(TenantContextGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuditLogsController>(AuditLogsController);
  });

  it('lists audit logs with tenant organizationId filter, severity and parsed dates', async () => {
    const mockResult = {
      items: [
        {
          id: 'log-1',
          action: 'CLINICAL_PATIENT_READ',
          resourceType: 'Patient',
          severity: AuditSeverity.INFO,
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    };
    service.findAll.mockResolvedValue(mockResult);

    const query = {
      branchId: 'branch-1',
      action: 'CLINICAL_PATIENT_READ',
      severity: AuditSeverity.INFO,
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-31T23:59:59.999Z',
      limit: 20,
      offset: 0,
    };

    const result = await controller.findAll(mockTenant, query);

    expect(service.findAll).toHaveBeenCalledWith({
      organizationId: 'org-uuid-1',
      branchId: 'branch-1',
      userId: undefined,
      resource: undefined,
      resourceType: undefined,
      resourceId: undefined,
      action: 'CLINICAL_PATIENT_READ',
      severity: AuditSeverity.INFO,
      search: undefined,
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-31T23:59:59.999Z'),
      limit: 20,
      offset: 0,
    });
    expect(result).toEqual(mockResult);
  });

  describe('export', () => {
    it('exports logs as CSV attachment setting proper headers', async () => {
      const mockExportData = {
        data: 'ID,Timestamp\n1,2026-08-19',
        contentType: 'text/csv; charset=utf-8',
        filename: 'audit_trail_export_2026-08-19.csv',
      };
      service.exportLogs.mockResolvedValue(mockExportData);

      const mockRes = {
        setHeader: jest.fn(),
      } as unknown as Response;

      const result = await controller.export(
        mockTenant,
        { format: 'csv' },
        mockRes,
      );

      expect(service.exportLogs).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org-uuid-1',
        }),
        'csv',
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/csv; charset=utf-8',
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="audit_trail_export_2026-08-19.csv"',
      );
      expect(result).toBe(mockExportData.data);
    });
  });

  it('retrieves single audit log entry by ID scoped to tenant', async () => {
    const mockEntry = {
      id: 'log-1',
      organizationId: 'org-uuid-1',
      action: 'CLINICAL_PATIENT_READ',
      severity: AuditSeverity.INFO,
    };
    service.findById.mockResolvedValue(mockEntry);

    const result = await controller.findOne('log-1', mockTenant);

    expect(service.findById).toHaveBeenCalledWith('log-1', 'org-uuid-1');
    expect(result).toEqual(mockEntry);
  });

  it('throws NotFoundException when entry does not exist', async () => {
    service.findById.mockResolvedValue(null);

    await expect(
      controller.findOne('non-existent-id', mockTenant),
    ).rejects.toThrow(NotFoundException);
  });
});
