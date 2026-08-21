import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { RequestContextService } from '../../common/request-context/request-context.service';
import { AUDIT_LOG_METADATA_KEY } from '../audit-logs.constants';
import { AuditLogService } from '../audit-logs.service';
import { AuditLogMetadataOptions } from '../audit-logs.types';

const REDACTED_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'tokendigest',
  'secret',
  'authorization',
  'refreshtoken',
  'accesstoken',
  'notes',
  'content',
  'clinicalnotes',
  'evolutionnotes',
  'diagnosis',
  'treatmentplan',
  'medicalhistory',
  'psychologicalhistory',
  'symptoms',
  'prescription',
]);

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditLogService: AuditLogService,
    private readonly requestContext: RequestContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const auditOptions =
      this.reflector.getAllAndOverride<AuditLogMetadataOptions>(
        AUDIT_LOG_METADATA_KEY,
        [context.getHandler(), context.getClass()],
      );

    if (!auditOptions) {
      return next.handle();
    }

    const startTime = Date.now();
    const httpCtx = context.switchToHttp();
    const request = httpCtx.getRequest<Request>();
    const response = httpCtx.getResponse<Response>();

    const ipAddress = this.extractIpAddress(request);
    const userAgent = (request.headers['user-agent'] as string) || null;
    const branchHeader = request.headers['x-branch-id'];
    const branchId =
      typeof branchHeader === 'string' && branchHeader.trim().length > 0
        ? branchHeader.trim()
        : Array.isArray(branchHeader) && branchHeader.length > 0
          ? branchHeader[0].trim()
          : null;

    // Tenant context and user identification
    const reqAny = request as unknown as Record<string, unknown>;
    const userObj = reqAny.user as
      | { id?: string; role?: string; organizationRole?: string }
      | undefined;
    const tenantCtx =
      (reqAny.tenantContext as
        | {
            organizationId?: string;
            organizationRole?: string;
            userId?: string;
          }
        | undefined) ?? this.requestContext.tenantContext;

    const userId =
      userObj?.id ??
      tenantCtx?.userId ??
      this.requestContext.tenantContext?.userId ??
      null;

    const actorRole =
      tenantCtx?.organizationRole ??
      userObj?.organizationRole ??
      userObj?.role ??
      null;

    const orgParam = request.params?.organizationId;
    const organizationId =
      tenantCtx?.organizationId ??
      this.requestContext.tenantContext?.organizationId ??
      (typeof orgParam === 'string'
        ? orgParam
        : Array.isArray(orgParam)
          ? orgParam[0]
          : null);

    return next.handle().pipe(
      tap({
        next: (result) => {
          const executionTimeMs = Date.now() - startTime;
          const statusCode = response?.statusCode ?? 200;

          const resourceId = auditOptions.extractResourceId
            ? auditOptions.extractResourceId(request, result)
            : this.resolveResourceId(request, result);

          const details = auditOptions.extractDetails
            ? auditOptions.extractDetails(request, result)
            : this.sanitizeDetails(request.body);

          void this.auditLogService.create({
            organizationId,
            branchId,
            userId,
            action: auditOptions.action,
            resourceType: auditOptions.resourceType,
            resourceId: resourceId ?? null,
            severity: auditOptions.severity,
            ipAddress,
            userAgent,
            statusCode,
            executionTimeMs,
            actorRole,
            details: details ?? null,
          });
        },
      }),
    );
  }

  private extractIpAddress(request: Request): string | null {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      return forwarded.split(',')[0].trim();
    }
    if (Array.isArray(forwarded) && forwarded.length > 0) {
      return forwarded[0].trim();
    }
    return request.ip || request.socket?.remoteAddress || null;
  }

  private resolveResourceId(request: Request, result: unknown): string | null {
    const params = request.params || {};

    const candidate =
      params.membershipId ||
      params.invitationId ||
      params.patientId ||
      params.caseFileId ||
      params.noteId ||
      params.documentId ||
      params.attachmentId ||
      params.appointmentId ||
      params.branchId ||
      params.id ||
      params.organizationId;

    if (candidate) {
      return typeof candidate === 'string'
        ? candidate
        : Array.isArray(candidate)
          ? candidate[0]
          : String(candidate);
    }

    if (result && typeof result === 'object' && 'id' in result) {
      const resId = (result as { id?: unknown }).id;
      if (typeof resId === 'string') return resId;
    }

    return null;
  }

  private sanitizeDetails(body: unknown): Record<string, unknown> | null {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return null;
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (REDACTED_KEYS.has(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else if (value !== undefined) {
        if (
          typeof value === 'object' &&
          value !== null &&
          !Array.isArray(value)
        ) {
          sanitized[key] = this.sanitizeDetails(value);
        } else {
          sanitized[key] = value;
        }
      }
    }

    return Object.keys(sanitized).length > 0 ? sanitized : null;
  }
}
