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
      throw new Error('Request context is not initialized');
    }

    context.tenantContext = tenantContext;
  }

  get tenantContext() {
    return this.storage.getStore()?.tenantContext;
  }
}
