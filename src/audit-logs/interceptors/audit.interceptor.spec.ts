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
        getResponse: () => ({}),
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

  it('captures audit log with extracted tenant context, user, IP, and sanitized payload', (done) => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      action: 'ORGANIZATION_UPDATE',
      resourceType: 'Organization',
    });

    const mockRequest = {
      user: { id: 'user-456' },
      tenantContext: { organizationId: 'org-789' },
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'JestTestAgent/1.0',
        'x-forwarded-for': '203.0.113.195, 70.41.3.18',
      },
      params: { organizationId: 'org-789' },
      body: {
        displayName: 'New Name',
        password: 'SuperSecretPassword',
        token: 'secret-token-123',
      },
    };

    const context = createMockExecutionContext(mockRequest);
    const next = createMockCallHandler({
      id: 'org-789',
      displayName: 'New Name',
    });

    interceptor.intercept(context, next).subscribe({
      next: () => {
        expect(auditLogService.create).toHaveBeenCalledWith({
          organizationId: 'org-789',
          userId: 'user-456',
          action: 'ORGANIZATION_UPDATE',
          resourceType: 'Organization',
          resourceId: 'org-789',
          ipAddress: '203.0.113.195',
          userAgent: 'JestTestAgent/1.0',
          details: {
            displayName: 'New Name',
            password: '[REDACTED]',
            token: '[REDACTED]',
          },
        });
        done();
      },
    });
  });

  it('extracts tenant context from RequestContextService if request context is initialized', (done) => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      action: 'ROLE_CHANGE',
      resourceType: 'OrganizationMembership',
    });

    const mockRequest = {
      headers: {},
      params: { membershipId: 'mem-999' },
      body: { role: 'ADMIN' },
    };

    const context = createMockExecutionContext(mockRequest);
    const next = createMockCallHandler();

    requestContextService.run('req-123', () => {
      requestContextService.setTenantContext({
        userId: 'async-user-1',
        organizationId: 'async-org-2',
        membershipId: 'async-mem-3',
        organizationRole: MembershipRole.OWNER,
        legacyUserRole: UserRole.ADMIN,
        resolutionMode: TenantResolutionMode.EXPLICIT,
      });

      interceptor.intercept(context, next).subscribe({
        next: () => {
          expect(auditLogService.create).toHaveBeenCalledWith({
            organizationId: 'async-org-2',
            userId: 'async-user-1',
            action: 'ROLE_CHANGE',
            resourceType: 'OrganizationMembership',
            resourceId: 'mem-999',
            ipAddress: null,
            userAgent: null,
            details: { role: 'ADMIN' },
          });
          done();
        },
      });
    });
  });

  it('respects custom extractResourceId and extractDetails callbacks', (done) => {
    type CustomResponse = { customId: string; value: string };

    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({
      action: 'CUSTOM_ACTION',
      resourceType: 'CustomResource',
      extractResourceId: (_req: unknown, res: unknown) =>
        `custom-${(res as CustomResponse).customId}`,
      extractDetails: (_req: unknown, res: unknown) => ({
        customProp: (res as CustomResponse).value,
      }),
    });

    const mockRequest = {
      params: { id: 'default-id' },
      body: { some: 'data' },
    };

    const context = createMockExecutionContext(mockRequest);
    const next = createMockCallHandler<CustomResponse>({
      customId: '777',
      value: 'custom-val',
    });

    interceptor.intercept(context, next).subscribe({
      next: () => {
        expect(auditLogService.create).toHaveBeenCalledWith({
          organizationId: null,
          userId: null,
          action: 'CUSTOM_ACTION',
          resourceType: 'CustomResource',
          resourceId: 'custom-777',
          ipAddress: null,
          userAgent: null,
          details: { customProp: 'custom-val' },
        });
        done();
      },
    });
  });
});
