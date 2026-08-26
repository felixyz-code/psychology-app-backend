import { UserRole } from '@prisma/client';
import { TenantResolutionMode } from '../common/request-context/request-context.service';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  const authService = {
    getTenantContext: jest.fn(),
    updatePreferredOrganization: jest.fn(),
    login: jest.fn(),
    freelancerBootstrap: jest.fn(),
    forgotPassword: jest.fn(),
    rotateRefreshToken: jest.fn(),
    listActiveSessions: jest.fn(),
    revokeSession: jest.fn(),
    revokeOtherSessions: jest.fn(),
    logout: jest.fn(),
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

  it('delegates POST /auth/forgot-password to the auth service', async () => {
    const dto = { email: 'test@example.com' };
    const response = {
      success: true,
      message:
        'Si el correo electrónico existe en la plataforma, se enviarán las instrucciones para restablecer el acceso.',
    };
    authService.forgotPassword = jest.fn().mockResolvedValue(response);

    await expect(controller.forgotPassword(dto)).resolves.toEqual(response);
    expect(authService.forgotPassword).toHaveBeenCalledWith(dto);
  });

  it('delegates POST /auth/login with request metadata to authService', async () => {
    const dto = { email: 'test@example.com', password: 'secret' };
    const req = {
      ip: '127.0.0.1',
      headers: { 'user-agent': 'JestClient/1.0' },
    };
    const response = { accessToken: 'jwt', refreshToken: 's.secret', user };
    authService.login = jest.fn().mockResolvedValue(response);

    await expect(controller.login(dto, req as never)).resolves.toEqual(
      response,
    );
    expect(authService.login).toHaveBeenCalledWith(
      dto,
      '127.0.0.1',
      'JestClient/1.0',
    );
  });

  it('delegates POST /auth/refresh with request metadata to authService', async () => {
    const dto = { refreshToken: 'session-id.secret' };
    const req = {
      ip: '127.0.0.1',
      headers: { 'user-agent': 'JestClient/1.0' },
    };
    const response = {
      accessToken: 'new-jwt',
      refreshToken: 'session-id.new-secret',
      user,
    };
    authService.rotateRefreshToken = jest.fn().mockResolvedValue(response);

    await expect(controller.refresh(dto, req as never)).resolves.toEqual(
      response,
    );
    expect(authService.rotateRefreshToken).toHaveBeenCalledWith(
      dto,
      '127.0.0.1',
      'JestClient/1.0',
    );
  });

  it('delegates GET /auth/sessions to authService', async () => {
    const sessions = [
      {
        id: 's1',
        ipAddress: '127.0.0.1',
        userAgent: 'Chrome',
        isCurrent: true,
      },
    ];
    authService.listActiveSessions = jest.fn().mockResolvedValue(sessions);

    await expect(controller.listSessions(user)).resolves.toEqual(sessions);
    expect(authService.listActiveSessions).toHaveBeenCalledWith(user);
  });

  it('delegates DELETE /auth/sessions/:id to authService', async () => {
    const response = { success: true, message: 'Session revoked' };
    authService.revokeSession = jest.fn().mockResolvedValue(response);

    await expect(
      controller.revokeSession(user, 'session-target-id'),
    ).resolves.toEqual(response);
    expect(authService.revokeSession).toHaveBeenCalledWith(
      user,
      'session-target-id',
    );
  });

  it('delegates POST /auth/sessions/revoke-others to authService', async () => {
    const response = {
      success: true,
      revokedCount: 2,
      message: 'All others revoked',
    };
    authService.revokeOtherSessions = jest.fn().mockResolvedValue(response);

    await expect(controller.revokeOtherSessions(user)).resolves.toEqual(
      response,
    );
    expect(authService.revokeOtherSessions).toHaveBeenCalledWith(user);
  });

  it('delegates POST /auth/logout to authService', async () => {
    const response = { success: true, message: 'Logged out' };
    authService.logout = jest.fn().mockResolvedValue(response);

    await expect(controller.logout(user)).resolves.toEqual(response);
    expect(authService.logout).toHaveBeenCalledWith(user);
  });
});
