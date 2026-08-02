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

  it('emits freelancer bootstrap events without password, jwt, or full email payloads', () => {
    const context = new RequestContextService();
    const service = new TenantObservabilityService(context);
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    context.run('request-bootstrap-456', () => {
      service.freelancerBootstrapCompleted({
        userId: '11111111-1111-4111-8111-111111111111',
        organizationId: '22222222-2222-4222-8222-222222222222',
        membershipId: '33333333-3333-4333-8333-333333333333',
      });
      service.freelancerBootstrapDenied('RATE_LIMITED', '203.0.113.10');
    });

    const entries = [...log.mock.calls, ...warn.mock.calls]
      .map(([event]) => String(event))
      .join('\n');
    expect(entries).toContain('request-bootstrap-456');
    expect(entries).toContain('freelancer_bootstrap_completed');
    expect(entries).toContain('freelancer_bootstrap_denied');
    expect(entries).not.toContain('freelancer@example.test');
    expect(entries).not.toContain('password');
    expect(entries).not.toContain('eyJ');
  });

  it('emits preferred-organization UX events without tenant authority or sensitive payloads', () => {
    const context = new RequestContextService();
    const service = new TenantObservabilityService(context);
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    context.run('request-preference-789', () => {
      service.activeOrganizationPreferenceChanged(
        'SUCCESS',
        'PREFERENCE_UPDATED',
        {
          userId: '11111111-1111-4111-8111-111111111111',
          preferredOrganizationId: '22222222-2222-4222-8222-222222222222',
          previousPreferredOrganizationId:
            '33333333-3333-4333-8333-333333333333',
        },
      );
      service.activeOrganizationPreferenceChanged(
        'DENY',
        'INACTIVE_ORGANIZATION',
        {
          userId: '11111111-1111-4111-8111-111111111111',
          preferredOrganizationId: '44444444-4444-4444-8444-444444444444',
        },
      );
    });

    const entries = [...log.mock.calls, ...warn.mock.calls]
      .map(([event]) => String(event))
      .filter((entry) =>
        entry.includes('active_organization_preference_changed'),
      )
      .join('\n');
    expect(entries).toContain('request-preference-789');
    expect(entries).toContain('active_organization_preference_changed');
    expect(entries).toContain('PREFERENCE_UPDATED');
    expect(entries).toContain('INACTIVE_ORGANIZATION');
    expect(entries).not.toContain('Bearer secret-token');
    expect(entries).not.toContain('clinician@example.test');
    expect(entries).not.toContain('membershipId');
  });
});
