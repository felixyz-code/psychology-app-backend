import { Prisma } from '@prisma/client';

export type AuditLogMetadataOptions = {
  action: string;
  resourceType: string;
  extractResourceId?: (
    request: any,
    responseBody?: any,
  ) => string | undefined | null;
  extractDetails?: (
    request: any,
    responseBody?: any,
  ) => Record<string, any> | undefined | null;
};

export type CreateAuditLogInput = {
  organizationId?: string | null;
  branchId?: string | null;
  userId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  statusCode?: number | null;
  executionTimeMs?: number | null;
  actorRole?: string | null;
  details?: Prisma.InputJsonValue | Record<string, any> | null;
};

export type FindAuditLogsFilter = {
  organizationId?: string;
  branchId?: string;
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  action?: string;
  search?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
};
