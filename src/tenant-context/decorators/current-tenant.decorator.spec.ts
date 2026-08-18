import { ForbiddenException } from '@nestjs/common';
import { MembershipRole, UserRole } from '@prisma/client';
import { TenantResolutionMode } from '../../common/request-context/request-context.service';
import { getCurrentTenant } from './current-tenant.decorator';

describe('CurrentTenant', () => {
  const tenantContext = Object.freeze({
    userId: '33333333-3333-4333-8333-333333333333',
    organizationId: '11111111-1111-4111-8111-111111111111',
    membershipId: '55555555-5555-4555-8555-555555555555',
    organizationRole: MembershipRole.OWNER,
    legacyUserRole: UserRole.ADMIN,
    resolutionMode: TenantResolutionMode.EXPLICIT,
  });

  it('returns the already-validated request context without reading headers or querying a database', () => {
    const request = {
      headers: { 'x-organization-id': 'untrusted-value' },
      tenantContext,
    };

    expect(getCurrentTenant(request, true)).toBe(tenantContext);
  });

  it('supports optional access and reports a clear error when required context is absent', () => {
    expect(getCurrentTenant({}, false)).toBeUndefined();
    expect(() => getCurrentTenant({}, true)).toThrow(ForbiddenException);
  });
});
