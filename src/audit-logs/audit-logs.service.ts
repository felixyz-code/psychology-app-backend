import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AuditSeverity,
  CreateAuditLogInput,
  FindAuditLogsFilter,
} from './audit-logs.types';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  resolveSeverity(
    data: Pick<CreateAuditLogInput, 'severity' | 'statusCode' | 'action'>,
  ): AuditSeverity {
    if (data.severity) {
      return data.severity;
    }

    const upperAction = data.action ? data.action.toUpperCase() : '';

    if (
      (data.statusCode !== undefined &&
        data.statusCode !== null &&
        data.statusCode >= 500) ||
      upperAction.includes('CRITICAL') ||
      upperAction.includes('BREACH')
    ) {
      return AuditSeverity.CRITICAL;
    }

    if (
      (data.statusCode !== undefined &&
        data.statusCode !== null &&
        data.statusCode >= 400) ||
      upperAction.includes('DELETE') ||
      upperAction.includes('REVOKE') ||
      upperAction.includes('REMOVE') ||
      upperAction.includes('SUSPEND')
    ) {
      return AuditSeverity.HIGH;
    }

    if (
      upperAction.includes('CREATE') ||
      upperAction.includes('UPDATE') ||
      upperAction.includes('MUTATION') ||
      upperAction.includes('UPLOAD')
    ) {
      return AuditSeverity.MEDIUM;
    }

    return AuditSeverity.INFO;
  }

  async create(data: CreateAuditLogInput) {
    try {
      const sanitizedDetails =
        data.details !== undefined && data.details !== null
          ? (data.details as Prisma.InputJsonValue)
          : Prisma.JsonNull;

      const severity = this.resolveSeverity(data);

      const createData: Prisma.AuditLogUncheckedCreateInput = {
        organizationId: data.organizationId ?? null,
        branchId: data.branchId ?? null,
        userId: data.userId ?? null,
        action: data.action,
        resourceType: data.resourceType,
        resourceId: data.resourceId ?? null,
        severity,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
        statusCode: data.statusCode ?? null,
        executionTimeMs: data.executionTimeMs ?? null,
        actorRole: data.actorRole ?? null,
        details: sanitizedDetails ?? Prisma.JsonNull,
      };

      return await this.prisma.auditLog.create({
        data: createData,
      });
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'audit_log_write_failed',
          action: data.action,
          resourceType: data.resourceType,
          branchId: data.branchId ?? null,
          errorType: error instanceof Error ? error.name : 'UnknownError',
          errorMessage: error instanceof Error ? error.message : String(error),
        }),
      );
      return null;
    }
  }

  async findAll(filter: FindAuditLogsFilter = {}) {
    const orgId = filter.organizationId ?? filter.tenantId;
    const fromDate = filter.from ?? filter.startDate;
    const toDate = filter.to ?? filter.endDate;

    const where: Prisma.AuditLogWhereInput = {
      ...(orgId && { organizationId: orgId }),
      ...(filter.branchId && { branchId: filter.branchId }),
      ...(filter.userId && { userId: filter.userId }),
      ...(filter.severity && { severity: filter.severity }),
      ...(filter.resourceType && { resourceType: filter.resourceType }),
      ...(filter.resourceId && { resourceId: filter.resourceId }),
      ...(filter.action && { action: filter.action }),
      ...(filter.resource &&
        !filter.resourceType &&
        !filter.resourceId && {
          OR: [
            {
              resourceType: { contains: filter.resource, mode: 'insensitive' },
            },
            { resourceId: { contains: filter.resource, mode: 'insensitive' } },
          ],
        }),
      ...(fromDate || toDate
        ? {
            timestamp: {
              ...(fromDate && { gte: fromDate }),
              ...(toDate && { lte: toDate }),
            },
          }
        : {}),
      ...(filter.search && {
        OR: [
          { action: { contains: filter.search, mode: 'insensitive' } },
          { resourceType: { contains: filter.search, mode: 'insensitive' } },
          { resourceId: { contains: filter.search, mode: 'insensitive' } },
          { user: { name: { contains: filter.search, mode: 'insensitive' } } },
          { user: { email: { contains: filter.search, mode: 'insensitive' } } },
        ],
      }),
    };

    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          branch: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  async exportLogs(
    filter: FindAuditLogsFilter = {},
    format: 'csv' | 'json' = 'csv',
  ): Promise<{ data: string; contentType: string; filename: string }> {
    const exportLimit = Math.min(filter.limit ?? 1000, 5000);
    const { items } = await this.findAll({
      ...filter,
      limit: exportLimit,
      offset: filter.offset ?? 0,
    });

    const timestampStr = new Date().toISOString().split('T')[0];

    if (format === 'json') {
      return {
        data: JSON.stringify(items, null, 2),
        contentType: 'application/json',
        filename: `audit_trail_export_${timestampStr}.json`,
      };
    }

    const headers = [
      'ID',
      'Timestamp (UTC)',
      'Organization ID',
      'Branch ID',
      'Branch Name',
      'Branch Code',
      'User ID',
      'User Name',
      'User Email',
      'Actor Role',
      'Severity',
      'Action',
      'Resource Type',
      'Resource ID',
      'IP Address',
      'User Agent',
      'HTTP Status',
      'Execution Time (ms)',
      'Details (JSON)',
    ];

    const rows: string[][] = items.map((entry) => [
      entry.id,
      entry.timestamp.toISOString(),
      entry.organizationId ?? '',
      entry.branchId ?? '',
      `"${(entry.branch?.name ?? '').replace(/"/g, '""')}"`,
      entry.branch?.code ?? '',
      entry.userId ?? '',
      `"${(entry.user?.name ?? '').replace(/"/g, '""')}"`,
      entry.user?.email ?? '',
      entry.actorRole ?? '',
      entry.severity ?? 'INFO',
      entry.action,
      entry.resourceType,
      entry.resourceId ?? '',
      entry.ipAddress ?? '',
      `"${(entry.userAgent ?? '').replace(/"/g, '""')}"`,
      String(entry.statusCode ?? ''),
      String(entry.executionTimeMs ?? ''),
      `"${JSON.stringify(entry.details ?? {}).replace(/"/g, '""')}"`,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\r\n');

    return {
      data: csvContent,
      contentType: 'text/csv; charset=utf-8',
      filename: `audit_trail_export_${timestampStr}.csv`,
    };
  }

  async findById(id: string, organizationId?: string) {
    return this.prisma.auditLog.findFirst({
      where: {
        id,
        ...(organizationId && { organizationId }),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });
  }

  async findByOrganization(organizationId: string, limit = 50) {
    return this.findAll({ organizationId, limit });
  }

  async findByUser(userId: string, limit = 50) {
    return this.findAll({ userId, limit });
  }
}
