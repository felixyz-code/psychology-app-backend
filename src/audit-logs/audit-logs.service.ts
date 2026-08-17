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
          branchId: data.branchId ?? null,
          userId: data.userId ?? null,
          action: data.action,
          resourceType: data.resourceType,
          resourceId: data.resourceId ?? null,
          ipAddress: data.ipAddress ?? null,
          userAgent: data.userAgent ?? null,
          statusCode: data.statusCode ?? null,
          executionTimeMs: data.executionTimeMs ?? null,
          actorRole: data.actorRole ?? null,
          details: detailsValue,
        },
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
    const where: Prisma.AuditLogWhereInput = {
      ...(filter.organizationId && { organizationId: filter.organizationId }),
      ...(filter.branchId && { branchId: filter.branchId }),
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
