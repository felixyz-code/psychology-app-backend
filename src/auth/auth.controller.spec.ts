import { UserRole } from '@prisma/client';
import { TenantResolutionMode } from '../common/request-context/request-context.service';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const authService = {
    getTenantContext: jest.fn(),
    updatePreferredOrganization: jest.fn(),
    login: jest.fn(),
    freelancerBootstrap: jest.fn(),
  };

  const controller = new AuthController(authService as never);
  const user = {
    id: 'user-id',
    name: 'Controller User',
    email: 'controller.user@example.test',
    role: UserRole.PSYCHOLOGIST,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates GET /auth/context to the auth service with the optional tenant context', async () => {
    const tenantContext = {
      userId: user.id,
      organizationId: 'organization-a',
      membershipId: 'membership-a',
      organizationRole: 'OWNER' as const,
      legacyUserRole: user.role,
      resolutionMode: TenantResolutionMode.EXPLICIT,
    };
    const response = {
      schemaVersion: 1 as const,
      status: 'ACTIVE_TENANT_READY' as const,
      tenantContext,
      organization: {
        id: 'organization-a',
        displayName: 'Organization A',
        status: 'ACTIVE' as const,
      },
      membership: null,
      capabilities: ['organization.read'],
      selectableMemberships: [],
      preferredOrganizationId: 'organization-a',
    };
    authService.getTenantContext.mockResolvedValue(response);

    await expect(controller.currentContext(user, tenantContext)).resolves.toBe(
      response,
    );

    expect(authService.getTenantContext).toHaveBeenCalledWith(
      user,
      tenantContext,
    );
  });

  it('delegates PUT /auth/context/preference to the auth service for clear and set payloads', async () => {
    authService.updatePreferredOrganization
      .mockResolvedValueOnce({
        preferredOrganizationId: null,
      })
      .mockResolvedValueOnce({
        preferredOrganizationId: 'organization-b',
      });

    await expect(
      controller.updateContextPreference(user, { organizationId: null }),
    ).resolves.toEqual({
      preferredOrganizationId: null,
    });
    await expect(
      controller.updateContextPreference(user, {
        organizationId: 'organization-b',
      }),
    ).resolves.toEqual({
      preferredOrganizationId: 'organization-b',
    });

    expect(authService.updatePreferredOrganization).toHaveBeenNthCalledWith(
      1,
      user,
      { organizationId: null },
    );
    expect(authService.updatePreferredOrganization).toHaveBeenNthCalledWith(
      2,
      user,
      { organizationId: 'organization-b' },
    );
  });
});
