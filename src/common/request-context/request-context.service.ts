import { Injectable } from '@nestjs/common';
import { MembershipRole, UserRole } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';

export enum TenantResolutionMode {
  EXPLICIT = 'EXPLICIT',
  SINGLE_MEMBERSHIP = 'SINGLE_MEMBERSHIP',
}

export type TenantContext = Readonly<{
  userId: string;
  organizationId: string;
  membershipId: string;
  organizationRole: MembershipRole;
  legacyUserRole: UserRole;
  resolutionMode: TenantResolutionMode;
}>;

export class RequestContextNotInitializedError extends Error {
  constructor() {
    super('Request context is not initialized');
    this.name = RequestContextNotInitializedError.name;
  }
}

export class TenantContextAlreadySetError extends Error {
  constructor() {
    super('Tenant context has already been resolved for this request');
    this.name = TenantContextAlreadySetError.name;
  }
}

export class RequiredTenantContextUnavailableError extends Error {
  constructor() {
    super('Tenant context is required');
    this.name = RequiredTenantContextUnavailableError.name;
  }
}

export type RequestContextData = {
  requestId: string;
  traceId?: string;
  spanId?: string;
  traceparent?: string;
  tenantContext?: TenantContext;
};

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContextData>();

  run<T>(
    contextOrRequestId:
      | string
      | {
          requestId: string;
          traceId?: string;
          spanId?: string;
          traceparent?: string;
        },
    callback: () => T,
  ): T {
    if (typeof contextOrRequestId === 'string') {
      return this.storage.run(
        {
          requestId: contextOrRequestId,
          traceId: contextOrRequestId,
        },
        callback,
      );
    }

    return this.storage.run(
      {
        requestId: contextOrRequestId.requestId,
        traceId: contextOrRequestId.traceId ?? contextOrRequestId.requestId,
        spanId: contextOrRequestId.spanId,
        traceparent: contextOrRequestId.traceparent,
      },
      callback,
    );
  }

  get requestId() {
    return this.storage.getStore()?.requestId;
  }

  get traceId() {
    return this.storage.getStore()?.traceId;
  }

  get spanId() {
    return this.storage.getStore()?.spanId;
  }

  get traceparent() {
    return this.storage.getStore()?.traceparent;
  }

  setTenantContext(tenantContext: TenantContext) {
    const context = this.storage.getStore();
    if (!context) {
      throw new RequestContextNotInitializedError();
    }

    if (context.tenantContext) {
      throw new TenantContextAlreadySetError();
    }

    // TenantContext contains only primitive fields. Freezing the validated
    // instance prevents a later guard or interceptor from changing scope.
    Object.freeze(tenantContext);

    context.tenantContext = tenantContext;
  }

  get tenantContext() {
    return this.storage.getStore()?.tenantContext;
  }

  getRequiredTenantContext(): TenantContext {
    const tenantContext = this.tenantContext;
    if (!tenantContext) {
      throw new RequiredTenantContextUnavailableError();
    }

    return tenantContext;
  }
}
