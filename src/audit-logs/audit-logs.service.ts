import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAuditLogInput, FindAuditLogsFilter } from './audit-logs.types';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateAuditLogInput) {
    try {
      const detailsValue =
        data.details !== undefined && data.details !== null
          ? (data.details as Prisma.InputJsonValue)
          : Prisma.JsonNull;

      return await this.prisma.auditLog.create({
        data: {
          organizationId: data.organizationId ?? null,
          userId: data.userId ?? null,
          action: data.action,
          resourceType: data.resourceType,
          resourceId: data.resourceId ?? null,
          ipAddress: data.ipAddress ?? null,
          userAgent: data.userAgent ?? null,
          details: detailsValue,
        },
      });
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'audit_log_write_failed',
          action: data.action,
          resourceType: data.resourceType,
          errorType: error instanceof Error ? error.name : 'UnknownError',
          errorMessage: error instanceof Error ? error.message : String(error),
        }),
      );
      return null;
    }
  }

  async findAll(filter: FindAuditLogsFilter = {}) {
    const where: Prisma.AuditLogWhereInput = {
      ...(filter.organizationId && { organizationId: filter.organizationId }),
      ...(filter.userId && { userId: filter.userId }),
      ...(filter.resourceType && { resourceType: filter.resourceType }),
      ...(filter.resourceId && { resourceId: filter.resourceId }),
      ...(filter.action && { action: filter.action }),
      ...(filter.from || filter.to
        ? {
            timestamp: {
              ...(filter.from && { gte: filter.from }),
              ...(filter.to && { lte: filter.to }),
            },
          }
        : {}),
    };

    return this.prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: filter.limit ?? 50,
      skip: filter.offset ?? 0,
    });
  }

  async findById(id: string) {
    return this.prisma.auditLog.findUnique({
      where: { id },
    });
  }

  async findByOrganization(organizationId: string, limit = 50) {
    return this.findAll({ organizationId, limit });
  }

  async findByUser(userId: string, limit = 50) {
    return this.findAll({ userId, limit });
  }
}
