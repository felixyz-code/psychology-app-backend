import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { TenantResolutionMode } from '../common/request-context/request-context.service';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({ compare: jest.fn(), hash: jest.fn() }));

type PrismaMock = {
  $transaction: jest.Mock;
  user: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  userSession: {
    create: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  organizationMembership: {
    findMany: jest.Mock;
  };
};

const user = {
  id: 'user-id',
  name: 'Current User',
  email: 'user@example.com',
  passwordHash: 'stored-password-hash',
  role: UserRole.PSYCHOLOGIST,
};

async function expectInvalidCredentials(login: Promise<unknown>) {
  try {
    await login;
    throw new Error('Expected login to reject');
  } catch (error) {
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).message).toBe(
      'Invalid email or password',
    );
    expect((error as UnauthorizedException).getStatus()).toBe(401);
  }
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaMock;
  let jwtService: { signAsync: jest.Mock };
  let bcryptCompare: jest.MockedFunction<typeof bcrypt.compare>;
  let bcryptHash: jest.MockedFunction<typeof bcrypt.hash>;
  let observability: {
    freelancerBootstrapCompleted: jest.Mock;
    freelancerBootstrapDenied: jest.Mock;
    activeOrganizationPreferenceChanged: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      userSession: {
        create: jest.fn().mockResolvedValue({ id: 'mock-session-id' }),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      organizationMembership: {
        findMany: jest.fn(),
      },
    };
    jwtService = {
      signAsync: jest.fn(),
    };
    bcryptCompare = bcrypt.compare as jest.MockedFunction<
      typeof bcrypt.compare
    >;
    bcryptHash = bcrypt.hash as jest.MockedFunction<typeof bcrypt.hash>;
    observability = {
      freelancerBootstrapCompleted: jest.fn(),
      freelancerBootstrapDenied: jest.fn(),
      activeOrganizationPreferenceChanged: jest.fn(),
    };
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      observability as never,
      {
        getUnconditionalCapabilities: jest
          .fn()
          .mockReturnValue(['organization.read']),
      } as never,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('signs the contractual payload and returns only the public user fields', async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    bcryptCompare.mockResolvedValue(true as never);
    jwtService.signAsync.mockResolvedValue('access-token');

    await expect(
      service.login({
        email: ` ${user.email.toUpperCase()} `,
        password: 'correct-password',
      }),
    ).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: expect.stringMatching(/^[a-f0-9-]+\.[a-f0-9]+$/),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { normalizedEmail: user.email },
    });
    expect(prisma.userSession.create).toHaveBeenCalled();
    expect(bcryptCompare).toHaveBeenCalledWith(
      'correct-password',
      user.passwordHash,
    );
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      sid: expect.any(String),
    });
  });

  it('rejects an unknown user with a generic error without signing a token', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expectInvalidCredentials(
      service.login({ email: 'unknown@example.com', password: 'password' }),
    );

    expect(bcryptCompare).not.toHaveBeenCalled();
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('rejects an invalid password with the same generic error without signing a token', async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    bcryptCompare.mockResolvedValue(false as never);

    await expectInvalidCredentials(
      service.login({ email: user.email, password: 'incorrect-password' }),
    );

    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('returns a complete ambiguous V1 projection with only active selectable memberships', async () => {
    prisma.user.findUnique.mockResolvedValue({
      preferredOrganizationId: 'organization-b',
    });
    prisma.organizationMembership.findMany.mockResolvedValue([
      {
        id: 'membership-a',
        userId: user.id,
        role: 'OWNER',
        status: 'ACTIVE',
        createdAt: new Date('2026-08-01T10:00:00.000Z'),
        updatedAt: new Date('2026-08-01T10:00:00.000Z'),
        user: { name: user.name, email: user.email },
        organization: {
          id: 'organization-a',
          displayName: 'Organization A',
          status: 'ACTIVE',
        },
      },
      {
        id: 'membership-b',
        userId: user.id,
        role: 'PSYCHOLOGIST',
        status: 'ACTIVE',
        createdAt: new Date('2026-08-01T11:00:00.000Z'),
        updatedAt: new Date('2026-08-01T11:00:00.000Z'),
        user: { name: user.name, email: user.email },
        organization: {
          id: 'organization-b',
          displayName: 'Organization B',
          status: 'ACTIVE',
        },
      },
    ]);

    await expect(service.getTenantContext(user)).resolves.toMatchObject({
      schemaVersion: 1,
      status: 'AMBIGUOUS_SELECTION',
      tenantContext: null,
      organization: null,
      membership: null,
      capabilities: [],
      preferredOrganizationId: 'organization-b',
      selectableMemberships: [
        {
          membershipId: 'membership-a',
          organizationId: 'organization-a',
          organizationDisplayName: 'Organization A',
          organizationRole: 'OWNER',
        },
        {
          membershipId: 'membership-b',
          organizationId: 'organization-b',
          organizationDisplayName: 'Organization B',
          organizationRole: 'PSYCHOLOGIST',
        },
      ],
    });
  });

  it('returns the active V1 context with canonical membership and projected capabilities', async () => {
    const createdAt = new Date('2026-08-01T10:00:00.000Z');
    prisma.user.findUnique.mockResolvedValue({
      preferredOrganizationId: 'organization-a',
    });
    prisma.organizationMembership.findMany.mockResolvedValue([
      {
        id: 'membership-a',
        userId: user.id,
        role: 'OWNER',
        status: 'ACTIVE',
        createdAt,
        updatedAt: createdAt,
        user: { name: user.name, email: user.email },
        organization: {
          id: 'organization-a',
          displayName: 'Organization A',
          status: 'ACTIVE',
        },
      },
    ]);
    const tenantContext = {
      userId: user.id,
      organizationId: 'organization-a',
      membershipId: 'membership-a',
      organizationRole: 'OWNER' as const,
      legacyUserRole: user.role,
      resolutionMode: TenantResolutionMode.EXPLICIT,
    };

    await expect(
      service.getTenantContext(user, tenantContext),
    ).resolves.toEqual({
      schemaVersion: 1,
      status: 'ACTIVE_TENANT_READY',
      tenantContext: {
        userId: user.id,
        organizationId: 'organization-a',
        membershipId: 'membership-a',
        organizationRole: 'OWNER',
        resolutionMode: TenantResolutionMode.EXPLICIT,
      },
      organization: {
        id: 'organization-a',
        displayName: 'Organization A',
        status: 'ACTIVE',
      },
      membership: {
        id: 'membership-a',
        userId: user.id,
        displayName: user.name,
        email: user.email,
        role: 'OWNER',
        status: 'ACTIVE',
        createdAt,
        updatedAt: createdAt,
        isCurrentUser: true,
      },
      capabilities: ['organization.read'],
      selectableMemberships: [
        {
          membershipId: 'membership-a',
          organizationId: 'organization-a',
          organizationDisplayName: 'Organization A',
          organizationRole: 'OWNER',
        },
      ],
      preferredOrganizationId: 'organization-a',
    });
  });

  it('returns NO_ACTIVE_TENANT with a fully redacted empty projection', async () => {
    prisma.user.findUnique.mockResolvedValue({
      preferredOrganizationId: 'organization-stale',
    });
    prisma.organizationMembership.findMany.mockResolvedValue([]);

    await expect(service.getTenantContext(user)).resolves.toEqual({
      schemaVersion: 1,
      status: 'NO_ACTIVE_TENANT',
      tenantContext: null,
      organization: null,
      membership: null,
      capabilities: [],
      selectableMemberships: [],
      preferredOrganizationId: null,
    });
  });

  it('creates the freelancer bootstrap user, organization, membership, and post-commit jwt', async () => {
    const createdAt = new Date('2026-08-01T12:00:00.000Z');
    bcryptHash.mockResolvedValue('hashed-password' as never);
    jwtService.signAsync.mockResolvedValue('bootstrap-token');
    prisma.$transaction.mockImplementation(
      async (work: (tx: Record<string, unknown>) => Promise<unknown>) =>
        work({
          user: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({
              id: 'user-bootstrap-id',
              name: 'Dra. Ana Martinez',
              email: 'Ana@example.test',
              role: UserRole.PSYCHOLOGIST,
            }),
          },
          organization: {
            create: jest.fn().mockResolvedValue({
              id: 'organization-bootstrap-id',
              slug: 'consultorio-ana-martinez',
              legalName: 'Consultorio Ana Martinez',
              displayName: 'Consultorio Ana Martinez',
              status: 'ACTIVE',
              timezone: 'UTC',
              locale: 'es-MX',
              currency: 'MXN',
            }),
          },
          organizationMembership: {
            create: jest.fn().mockResolvedValue({
              id: 'membership-bootstrap-id',
              organizationId: 'organization-bootstrap-id',
              userId: 'user-bootstrap-id',
              role: 'OWNER',
              status: 'ACTIVE',
              joinedAt: createdAt,
            }),
          },
        }),
    );

    await expect(
      service.freelancerBootstrap(
        {
          email: ' Ana@example.test ',
          password: 'FreelancerBootstrapSecret1!',
          name: ' Dra. Ana Martinez ',
          organizationName: ' Consultorio Ana Martinez ',
        },
        '203.0.113.40',
      ),
    ).resolves.toMatchObject({
      accessToken: 'bootstrap-token',
      user: {
        id: 'user-bootstrap-id',
        email: 'Ana@example.test',
        role: UserRole.PSYCHOLOGIST,
      },
      organization: {
        id: 'organization-bootstrap-id',
        slug: 'consultorio-ana-martinez',
        status: 'ACTIVE',
      },
      membership: {
        id: 'membership-bootstrap-id',
        role: 'OWNER',
        status: 'ACTIVE',
        joinedAt: createdAt,
      },
    });

    expect(bcryptHash).toHaveBeenCalledWith('FreelancerBootstrapSecret1!', 10);
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }),
    );
    expect(observability.freelancerBootstrapCompleted).toHaveBeenCalledWith({
      userId: 'user-bootstrap-id',
      organizationId: 'organization-bootstrap-id',
      membershipId: 'membership-bootstrap-id',
    });
    expect(observability.freelancerBootstrapDenied).not.toHaveBeenCalled();
  });

  it('returns a uniform bootstrap conflict without emitting success observability', async () => {
    bcryptHash.mockResolvedValue('hashed-password' as never);
    prisma.$transaction.mockImplementation(
      async (work: (tx: Record<string, unknown>) => Promise<unknown>) =>
        work({
          user: {
            findUnique: jest.fn().mockResolvedValue({
              id: 'existing-user-id',
            }),
          },
          organization: {
            create: jest.fn(),
          },
          organizationMembership: {
            create: jest.fn(),
          },
        }),
    );

    await expect(
      service.freelancerBootstrap(
        {
          email: 'Existing@example.test',
          password: 'FreelancerBootstrapSecret1!',
          name: 'Existing User',
          organizationName: 'Existing Practice',
        },
        '203.0.113.41',
      ),
    ).rejects.toMatchObject({
      message: 'Registration could not be completed',
    });

    expect(observability.freelancerBootstrapDenied).toHaveBeenCalledWith(
      'REGISTRATION_CONFLICT',
      '203.0.113.41',
    );
    expect(observability.freelancerBootstrapCompleted).not.toHaveBeenCalled();
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('persists an eligible preferred organization and emits one post-commit success event', async () => {
    prisma.$transaction.mockImplementation(
      async (work: (tx: Record<string, unknown>) => Promise<unknown>) =>
        work({
          user: {
            findUnique: jest.fn().mockResolvedValue({
              preferredOrganizationId: 'organization-old',
            }),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          organizationMembership: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'membership-a',
              status: 'ACTIVE',
              organization: {
                status: 'ACTIVE',
              },
            }),
          },
        }),
    );

    await expect(
      service.updatePreferredOrganization(user, {
        organizationId: 'organization-a',
      }),
    ).resolves.toEqual({
      preferredOrganizationId: 'organization-a',
    });

    expect(
      observability.activeOrganizationPreferenceChanged,
    ).toHaveBeenCalledWith('SUCCESS', 'PREFERENCE_UPDATED', {
      userId: user.id,
      preferredOrganizationId: 'organization-a',
      previousPreferredOrganizationId: 'organization-old',
    });
  });

  it('clears the preferred organization and emits a post-commit clear event', async () => {
    prisma.$transaction.mockImplementation(
      async (work: (tx: Record<string, unknown>) => Promise<unknown>) =>
        work({
          user: {
            findUnique: jest.fn().mockResolvedValue({
              preferredOrganizationId: 'organization-a',
            }),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
        }),
    );

    await expect(
      service.updatePreferredOrganization(user, {
        organizationId: null,
      }),
    ).resolves.toEqual({
      preferredOrganizationId: null,
    });

    expect(
      observability.activeOrganizationPreferenceChanged,
    ).toHaveBeenCalledWith('SUCCESS', 'PREFERENCE_CLEARED', {
      userId: user.id,
      previousPreferredOrganizationId: 'organization-a',
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }),
    );
  });

  it('returns a redacted not found response for an inaccessible organization and emits a deny event', async () => {
    prisma.$transaction.mockImplementation(
      async (work: (tx: Record<string, unknown>) => Promise<unknown>) =>
        work({
          user: {
            findUnique: jest.fn().mockResolvedValue({
              preferredOrganizationId: null,
            }),
          },
          organizationMembership: {
            findFirst: jest.fn().mockResolvedValue(null),
          },
        }),
    );

    await expect(
      service.updatePreferredOrganization(user, {
        organizationId: 'organization-x',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(
      observability.activeOrganizationPreferenceChanged,
    ).toHaveBeenCalledWith('DENY', 'INELIGIBLE_ORGANIZATION', {
      userId: user.id,
      preferredOrganizationId: 'organization-x',
    });
  });

  it('returns a redacted not found response for an inactive membership and emits a deny event', async () => {
    prisma.$transaction.mockImplementation(
      async (work: (tx: Record<string, unknown>) => Promise<unknown>) =>
        work({
          user: {
            findUnique: jest.fn().mockResolvedValue({
              preferredOrganizationId: null,
            }),
          },
          organizationMembership: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'membership-a',
              status: 'SUSPENDED',
              organization: {
                status: 'ACTIVE',
              },
            }),
          },
        }),
    );

    await expect(
      service.updatePreferredOrganization(user, {
        organizationId: 'organization-a',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(
      observability.activeOrganizationPreferenceChanged,
    ).toHaveBeenCalledWith('DENY', 'INACTIVE_MEMBERSHIP', {
      userId: user.id,
      preferredOrganizationId: 'organization-a',
    });
  });

  it('returns a redacted not found response for an inactive organization and emits a deny event', async () => {
    prisma.$transaction.mockImplementation(
      async (work: (tx: Record<string, unknown>) => Promise<unknown>) =>
        work({
          user: {
            findUnique: jest.fn().mockResolvedValue({
              preferredOrganizationId: null,
            }),
          },
          organizationMembership: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'membership-a',
              status: 'ACTIVE',
              organization: {
                status: 'SUSPENDED',
              },
            }),
          },
        }),
    );

    await expect(
      service.updatePreferredOrganization(user, {
        organizationId: 'organization-a',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(
      observability.activeOrganizationPreferenceChanged,
    ).toHaveBeenCalledWith('DENY', 'INACTIVE_ORGANIZATION', {
      userId: user.id,
      preferredOrganizationId: 'organization-a',
    });
  });

  it('retries serialization conflicts and emits the success event only once after commit', async () => {
    prisma.$transaction
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('serialization', {
          code: 'P2034',
          clientVersion: 'test',
        }),
      )
      .mockImplementationOnce(
        async (work: (tx: Record<string, unknown>) => Promise<unknown>) =>
          work({
            user: {
              findUnique: jest.fn().mockResolvedValue({
                preferredOrganizationId: null,
              }),
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            organizationMembership: {
              findFirst: jest.fn().mockResolvedValue({
                id: 'membership-a',
                status: 'ACTIVE',
                organization: {
                  status: 'ACTIVE',
                },
              }),
            },
          }),
      );

    await expect(
      service.updatePreferredOrganization(user, {
        organizationId: 'organization-a',
      }),
    ).resolves.toEqual({
      preferredOrganizationId: 'organization-a',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(
      observability.activeOrganizationPreferenceChanged.mock.calls.filter(
        ([outcome]) => outcome === 'SUCCESS',
      ),
    ).toHaveLength(1);
  });

  it('retries a clear when commit aborts after the callback and emits success only after the committed retry', async () => {
    prisma.$transaction
      .mockImplementationOnce(
        async (work: (tx: Record<string, unknown>) => Promise<unknown>) => {
          await work({
            user: {
              findUnique: jest.fn().mockResolvedValue({
                preferredOrganizationId: 'organization-a',
              }),
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
          });
          throw new Prisma.PrismaClientKnownRequestError('serialization', {
            code: 'P2034',
            clientVersion: 'test',
          });
        },
      )
      .mockImplementationOnce(
        async (work: (tx: Record<string, unknown>) => Promise<unknown>) =>
          work({
            user: {
              findUnique: jest.fn().mockResolvedValue({
                preferredOrganizationId: 'organization-a',
              }),
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
          }),
      );

    await expect(
      service.updatePreferredOrganization(user, {
        organizationId: null,
      }),
    ).resolves.toEqual({
      preferredOrganizationId: null,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(
      observability.activeOrganizationPreferenceChanged.mock.calls.filter(
        ([outcome, reasonCode]) =>
          outcome === 'SUCCESS' && reasonCode === 'PREFERENCE_CLEARED',
      ),
    ).toHaveLength(1);
  });

  it('surfaces a final concurrent conflict without emitting a success event', async () => {
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('serialization', {
        code: 'P2034',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.updatePreferredOrganization(user, {
        organizationId: 'organization-a',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(
      observability.activeOrganizationPreferenceChanged,
    ).not.toHaveBeenCalledWith('SUCCESS', expect.anything(), expect.anything());
  });

  it('surfaces a final concurrent conflict during clear without emitting a success event', async () => {
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('serialization', {
        code: 'P2034',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.updatePreferredOrganization(user, {
        organizationId: null,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(
      observability.activeOrganizationPreferenceChanged,
    ).not.toHaveBeenCalledWith('SUCCESS', expect.anything(), expect.anything());
  });

  it('returns generic success on forgotPassword whether user exists or not', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      email: 'test@example.com',
    });
    const res1 = await service.forgotPassword({ email: 'test@example.com' });
    expect(res1.success).toBe(true);
    expect(res1.message).toContain('instrucciones');

    prisma.user.findUnique.mockResolvedValueOnce(null);
    const res2 = await service.forgotPassword({
      email: 'nonexistent@example.com',
    });
    expect(res2.success).toBe(true);
    expect(res2.message).toContain('instrucciones');
  });

  describe('Session Hardening & Refresh Token Rotation', () => {
    const sessionId = 'a0000000-0000-4000-8000-000000000001';
    const rawSecret = '11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff';
    const secretHash = require('crypto').createHash('sha256').update(rawSecret).digest('hex');
    const validRefreshToken = `${sessionId}.${rawSecret}`;

    it('successfully rotates a valid refresh token and emits new credentials', async () => {
      prisma.userSession.findUnique.mockResolvedValue({
        id: sessionId,
        userId: user.id,
        refreshTokenHash: secretHash,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 1000000),
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        deviceInfo: 'Chrome en Windows 10/11',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      });
      jwtService.signAsync.mockResolvedValue('rotated-access-token');

      const result = await service.rotateRefreshToken({ refreshToken: validRefreshToken });

      expect(result.accessToken).toBe('rotated-access-token');
      expect(result.refreshToken).toMatch(new RegExp(`^${sessionId}\\.[a-f0-9]+$`));
      expect(result.user).toEqual({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      });
      expect(prisma.userSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: sessionId },
        }),
      );
    });

    it('rejects an invalid refresh token format', async () => {
      await expect(
        service.rotateRefreshToken({ refreshToken: 'malformedtoken' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects if the session is not found', async () => {
      prisma.userSession.findUnique.mockResolvedValue(null);

      await expect(
        service.rotateRefreshToken({ refreshToken: validRefreshToken }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('detects breach and invalidates ALL user sessions when presented with a revoked token', async () => {
      prisma.userSession.findUnique.mockResolvedValue({
        id: sessionId,
        userId: user.id,
        refreshTokenHash: secretHash,
        isRevoked: true,
        expiresAt: new Date(Date.now() + 1000000),
        user,
      });

      await expect(
        service.rotateRefreshToken({ refreshToken: validRefreshToken }),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { userId: user.id, isRevoked: false },
        data: {
          isRevoked: true,
          revokedAt: expect.any(Date),
          revokedReason: 'REUSE_BREACH_DETECTED',
        },
      });
    });

    it('detects breach and invalidates ALL user sessions on secret hash mismatch (token reuse attack)', async () => {
      prisma.userSession.findUnique.mockResolvedValue({
        id: sessionId,
        userId: user.id,
        refreshTokenHash: 'different-stored-hash',
        isRevoked: false,
        expiresAt: new Date(Date.now() + 1000000),
        user,
      });

      await expect(
        service.rotateRefreshToken({ refreshToken: validRefreshToken }),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
        where: { userId: user.id, isRevoked: false },
        data: {
          isRevoked: true,
          revokedAt: expect.any(Date),
          revokedReason: 'REUSE_BREACH_DETECTED',
        },
      });
    });

    it('marks session revoked and rejects when token has expired', async () => {
      prisma.userSession.findUnique.mockResolvedValue({
        id: sessionId,
        userId: user.id,
        refreshTokenHash: secretHash,
        isRevoked: false,
        expiresAt: new Date(Date.now() - 10000),
        user,
      });

      await expect(
        service.rotateRefreshToken({ refreshToken: validRefreshToken }),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.userSession.update).toHaveBeenCalledWith({
        where: { id: sessionId },
        data: {
          isRevoked: true,
          revokedAt: expect.any(Date),
          revokedReason: 'EXPIRED',
        },
      });
    });

    it('lists active sessions for user and flags the current session correctly', async () => {
      const now = new Date();
      prisma.userSession.findMany.mockResolvedValue([
        {
          id: sessionId,
          ipAddress: '192.168.1.1',
          userAgent: 'Chrome',
          deviceInfo: 'Chrome en Windows',
          lastActiveAt: now,
          createdAt: now,
        },
        {
          id: 'other-session-id',
          ipAddress: '192.168.1.2',
          userAgent: 'Safari',
          deviceInfo: 'Safari en iOS',
          lastActiveAt: now,
          createdAt: now,
        },
      ]);

      const authUser = { ...user, sessionId };
      const sessions = await service.listActiveSessions(authUser);

      expect(sessions).toHaveLength(2);
      expect(sessions[0].isCurrent).toBe(true);
      expect(sessions[1].isCurrent).toBe(false);
    });

    it('revokes a specific session belonging to the user', async () => {
      prisma.userSession.findFirst.mockResolvedValue({
        id: 'target-session-id',
        userId: user.id,
        isRevoked: false,
      });

      const res = await service.revokeSession(user, 'target-session-id');

      expect(res.success).toBe(true);
      expect(prisma.userSession.update).toHaveBeenCalledWith({
        where: { id: 'target-session-id' },
        data: {
          isRevoked: true,
          revokedAt: expect.any(Date),
          revokedReason: 'MANUAL_REVOCATION',
        },
      });
    });

    it('throws NotFoundException when revoking a non-existent session', async () => {
      prisma.userSession.findFirst.mockResolvedValue(null);

      await expect(
        service.revokeSession(user, 'non-existent-session'),
      ).rejects.toThrow(NotFoundException);
    });

    it('revokes other sessions excluding the current session', async () => {
      prisma.userSession.updateMany.mockResolvedValue({ count: 3 });

      const authUser = { ...user, sessionId: 'my-current-session' };
      const res = await service.revokeOtherSessions(authUser);

      expect(res.success).toBe(true);
      expect(res.revokedCount).toBe(3);
      expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
        where: {
          userId: user.id,
          isRevoked: false,
          id: { not: 'my-current-session' },
        },
        data: {
          isRevoked: true,
          revokedAt: expect.any(Date),
          revokedReason: 'MANUAL_REVOCATION',
        },
      });
    });

    it('logs out and revokes the current session', async () => {
      const authUser = { ...user, sessionId: 'my-current-session' };
      const res = await service.logout(authUser);

      expect(res.success).toBe(true);
      expect(prisma.userSession.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'my-current-session',
          userId: user.id,
          isRevoked: false,
        },
        data: {
          isRevoked: true,
          revokedAt: expect.any(Date),
          revokedReason: 'LOGOUT',
        },
      });
    });
  });
});
