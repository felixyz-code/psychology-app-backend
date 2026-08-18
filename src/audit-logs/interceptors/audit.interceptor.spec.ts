import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';
import { AuditLogService } from '../audit-logs.service';
import {
  RequestContextService,
  TenantResolutionMode,
} from '../../common/request-context/request-context.service';
import { MembershipRole, UserRole } from '@prisma/client';

describe('AuditInterceptor', () => {
  let interceptor: AuditInterceptor;
  let reflector: Reflector;
  let auditLogService: { create: jest.Mock };
  let requestContextService: RequestContextService;

  beforeEach(() => {
    reflector = new Reflector();
    auditLogService = {
      create: jest.fn().mockResolvedValue({ id: 'audit-123' }),
    };
    requestContextService = new RequestContextService();

    interceptor = new AuditInterceptor(
      reflector,
      auditLogService as unknown as AuditLogService,
      requestContextService,
    );
  });

  function createMockExecutionContext(
    req: Record<string, unknown> = {},
  ): ExecutionContext {
    const handler = () => {};
    const controllerClass = class {};

    const mockRequest = {
      headers: {},
      params: {},
      body: {},
      ...req,
    };

    return {
      getHandler: () => handler,
      getClass: () => controllerClass,
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => ({ statusCode: 200 }),
        getNext: () => ({}),
      }),
    } as unknown as ExecutionContext;
  }

  function createMockCallHandler<T = unknown>(
    responseValue: T = { success: true } as unknown as T,
  ): CallHandler {
    return {
      handle: () => of(responseValue),
    };
  }

  it('passes through without logging if no @AuditLog metadata exists', (done) => {
    const context = createMockExecutionContext();
    const next = createMockCallHandler();

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    interceptor.intercept(context, next).subscribe({
      next: (result) => {
        expect(result).toEqual({ success: true });
        expect(auditLogService.create).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('captures audit log with extracted tenant context, branchId, user, IP, and sanitized clinical payload', (done) => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      action: 'CLINICAL_NOTE_UPDATE',
      resourceType: 'SessionNote',
    });

    const mockRequest = {
      user: { id: 'user-456', organizationRole: 'PSYCHOLOGIST' },
      tenantContext: {
        organizationId: 'org-789',
        organizationRole: 'PSYCHOLOGIST',
      },
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'JestTestAgent/1.0',
        'x-forwarded-for': '203.0.113.195, 70.41.3.18',
        'x-branch-id': 'branch-uuid-1',
      },
      params: { id: 'note-uuid-999' },
      body: {
        title: 'Session 1',
        notes: 'Highly confidential psychiatric clinical narrative',
        diagnosis: 'F41.1',
        password: 'SuperSecretPassword',
        token: 'secret-token-123',
      },
    };

    const context = createMockExecutionContext(mockRequest);
    const next = createMockCallHandler({ id: 'note-uuid-999', updated: true });

    interceptor.intercept(context, next).subscribe({
      next: () => {
        expect(auditLogService.create).toHaveBeenCalledWith({
          organizationId: 'org-789',
          branchId: 'branch-uuid-1',
          userId: 'user-456',
          action: 'CLINICAL_NOTE_UPDATE',
          resourceType: 'SessionNote',
          resourceId: 'note-uuid-999',
          ipAddress: '203.0.113.195',
          userAgent: 'JestTestAgent/1.0',
          statusCode: 200,
          executionTimeMs: expect.any(Number),
          actorRole: 'PSYCHOLOGIST',
          details: {
            title: 'Session 1',
            notes: '[REDACTED]',
            diagnosis: '[REDACTED]',
            password: '[REDACTED]',
            token: '[REDACTED]',
          },
        });
        done();
      },
    });
  });

  it('uses requestContextService fallback if request has no tenantContext or user', (done) => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      action: 'ORGANIZATION_STATUS_CHANGE',
      resourceType: 'Organization',
    });

    requestContextService.run('req-1', () => {
      requestContextService.setTenantContext({
        userId: 'fallback-user-id',
        organizationId: 'fallback-org-id',
        membershipId: 'fallback-mem-id',
        organizationRole: MembershipRole.OWNER,
        legacyUserRole: UserRole.ADMIN,
        resolutionMode: TenantResolutionMode.EXPLICIT,
      });

      const mockRequest = {
        headers: {},
        params: { id: 'fallback-org-id' },
        body: { status: 'SUSPENDED' },
      };

      const context = createMockExecutionContext(mockRequest);
      const next = createMockCallHandler();

      interceptor.intercept(context, next).subscribe({
        next: () => {
          expect(auditLogService.create).toHaveBeenCalledWith({
            organizationId: 'fallback-org-id',
            branchId: null,
            userId: 'fallback-user-id',
            action: 'ORGANIZATION_STATUS_CHANGE',
            resourceType: 'Organization',
            resourceId: 'fallback-org-id',
            ipAddress: null,
            userAgent: null,
            statusCode: 200,
            executionTimeMs: expect.any(Number),
            actorRole: MembershipRole.OWNER,
            details: { status: 'SUSPENDED' },
          });
          done();
        },
      });
    });
  });

  it('supports custom extractResourceId and extractDetails functions', (done) => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      action: 'CUSTOM_ACTION',
      resourceType: 'CustomResource',
      extractResourceId: (req, res: any) => `custom-${res.customId}`,
      extractDetails: (req, res: any) => ({ customMetric: res.score }),
    });

    const mockRequest = {
      user: { id: 'user-1' },
      tenantContext: { organizationId: 'org-1' },
      headers: {},
      params: {},
      body: {},
    };

    const context = createMockExecutionContext(mockRequest);
    const next = createMockCallHandler({ customId: '777', score: 100 });

    interceptor.intercept(context, next).subscribe({
      next: () => {
        expect(auditLogService.create).toHaveBeenCalledWith({
          organizationId: 'org-1',
          branchId: null,
          userId: 'user-1',
          action: 'CUSTOM_ACTION',
          resourceType: 'CustomResource',
          resourceId: 'custom-777',
          ipAddress: null,
          userAgent: null,
          statusCode: 200,
          executionTimeMs: expect.any(Number),
          actorRole: null,
          details: { customMetric: 100 },
        });
        done();
      },
    });
  });
});
