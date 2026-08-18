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

type RequestContext = {
  requestId: string;
  tenantContext?: TenantContext;
};

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(requestId: string, callback: () => T): T {
    return this.storage.run({ requestId }, callback);
  }

  get requestId() {
    return this.storage.getStore()?.requestId;
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
