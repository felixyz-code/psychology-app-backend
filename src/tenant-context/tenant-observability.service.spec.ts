import { Logger } from '@nestjs/common';
import { MembershipRole, UserRole } from '@prisma/client';
import {
  RequestContextService,
  TenantResolutionMode,
} from '../common/request-context/request-context.service';
import { OrganizationCapability } from './authorization/organization-capability';
import { TenantObservabilityService } from './tenant-observability.service';

describe('TenantObservabilityService', () => {
  it('emits bounded technical metadata without raw headers, tokens, or PHI', () => {
    const context = new RequestContextService();
    const service = new TenantObservabilityService(context);
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const tenant = Object.freeze({
      userId: '11111111-1111-4111-8111-111111111111',
      organizationId: '22222222-2222-4222-8222-222222222222',
      membershipId: '33333333-3333-4333-8333-333333333333',
      organizationRole: MembershipRole.ADMIN,
      legacyUserRole: UserRole.ADMIN,
      resolutionMode: TenantResolutionMode.EXPLICIT,
    });

    context.run('request-safe-123', () => {
      service.resolutionSucceeded(tenant);
      service.invalidHeader(tenant.userId);
      service.capabilityDenied(
        tenant,
        OrganizationCapability.PATIENT_CREATE,
        '/patients',
      );
    });

    const events = warn.mock.calls.map(([event]) => String(event)).join('\n');
    expect(events).toContain('request-safe-123');
    expect(events).toContain(tenant.organizationId);
    expect(events).toContain(OrganizationCapability.PATIENT_CREATE);
    expect(events).not.toContain('clinician@example.test');
    expect(events).not.toContain('Bearer secret-token');
    expect(events).not.toContain('X-Organization-Id:');
    expect(events).not.toContain('rawRequestPayload');
  });
});
