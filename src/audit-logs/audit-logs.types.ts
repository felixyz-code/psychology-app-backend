import { Prisma } from '@prisma/client';

export enum AuditSeverity {
  INFO = 'INFO',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export type AuditLogMetadataOptions = {
  action: string;
  resourceType: string;
  severity?: AuditSeverity;
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
  severity?: AuditSeverity;
  ipAddress?: string | null;
  userAgent?: string | null;
  statusCode?: number | null;
  executionTimeMs?: number | null;
  actorRole?: string | null;
  details?: Prisma.InputJsonValue | Record<string, any> | null;
};

export type FindAuditLogsFilter = {
  organizationId?: string;
  tenantId?: string;
  branchId?: string;
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  resource?: string;
  action?: string;
  severity?: AuditSeverity;
  search?: string;
  from?: Date;
  to?: Date;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  format?: 'csv' | 'json';
};
