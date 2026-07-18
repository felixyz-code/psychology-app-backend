import { MembershipRole, UserRole } from '@prisma/client';
import {
  RequestContextService,
  TenantResolutionMode,
} from './request-context.service';

describe('RequestContextService tenant isolation', () => {
  it('keeps interleaved async tenant contexts isolated and cleans them up after each request', async () => {
    const context = new RequestContextService();
    const tenantA = tenant('11111111-1111-4111-8111-111111111111');
    const tenantB = tenant('22222222-2222-4222-8222-222222222222');
    let releaseA!: () => void;
    const waitA = new Promise<void>((resolve) => (releaseA = resolve));

    const requestA = context.run('request-a', async () => {
      context.setTenantContext(tenantA);
      await waitA;
      return context.tenantContext;
    });
    const requestB = context.run('request-b', async () => {
      context.setTenantContext(tenantB);
      await Promise.resolve();
      return context.tenantContext;
    });

    await expect(requestB).resolves.toBe(tenantB);
    releaseA();
    await expect(requestA).resolves.toBe(tenantA);
    expect(context.tenantContext).toBeUndefined();
    expect(context.requestId).toBeUndefined();
  });
});

function tenant(organizationId: string) {
  return Object.freeze({
    userId: '33333333-3333-4333-8333-333333333333',
    organizationId,
    membershipId: `membership-${organizationId}`,
    organizationRole: MembershipRole.OWNER,
    legacyUserRole: UserRole.ADMIN,
    resolutionMode: TenantResolutionMode.EXPLICIT,
  });
}
