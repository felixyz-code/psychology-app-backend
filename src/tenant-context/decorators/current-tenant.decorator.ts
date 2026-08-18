import {
  ExecutionContext,
  ForbiddenException,
  createParamDecorator,
} from '@nestjs/common';
import { TenantContext } from '../tenant-context.types';

type TenantRequest = { tenantContext?: TenantContext };

export function getCurrentTenant(
  request: TenantRequest,
  required: boolean | undefined,
): TenantContext | undefined {
  const tenantContext = request.tenantContext;

  if (required && !tenantContext) {
    throw new ForbiddenException('Tenant context is required');
  }

  return tenantContext;
}

/** Returns only the context validated by TenantContextGuard; it never reads headers. */
export const CurrentTenant = createParamDecorator(
  (
    required: boolean | undefined,
    context: ExecutionContext,
  ): TenantContext | undefined => {
    const request = context.switchToHttp().getRequest<TenantRequest>();
    return getCurrentTenant(request, required);
  },
);
