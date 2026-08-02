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
    expect(bcryptCompare).toHaveBeenCalledWith(
      'correct-password',
      user.passwordHash,
    );
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
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

  it('returns only the current user selectable memberships when tenant resolution is ambiguous', async () => {
    prisma.user.findUnique.mockResolvedValue({
      preferredOrganizationId: 'organization-b',
    });
    prisma.organizationMembership.findMany.mockResolvedValue([
      {
        id: 'membership-a-revoked',
        role: 'OWNER',
        status: 'REVOKED',
        organization: {
          id: 'organization-a',
          displayName: 'Organization A',
          status: 'ACTIVE',
        },
      },
      {
        id: 'membership-a',
        role: 'OWNER',
        status: 'ACTIVE',
        organization: {
          id: 'organization-a',
          displayName: 'Organization A',
          status: 'ACTIVE',
        },
      },
      {
        id: 'membership-b',
        role: 'PSYCHOLOGIST',
        status: 'ACTIVE',
        organization: {
          id: 'organization-b',
          displayName: 'Organization B',
          status: 'ACTIVE',
        },
      },
    ]);

    await expect(service.getTenantContext(user)).resolves.toEqual({
      status: 'UNRESOLVED',
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
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: user.id },
      select: { preferredOrganizationId: true },
    });
    expect(prisma.organizationMembership.findMany).toHaveBeenCalledWith({
      where: {
        userId: user.id,
        status: {
          in: ['INVITED', 'ACTIVE', 'SUSPENDED'],
        },
      },
      select: {
        id: true,
        role: true,
        status: true,
        organization: {
          select: { id: true, displayName: true, status: true },
        },
      },
      orderBy: [
        { organizationId: 'asc' },
        { createdAt: 'desc' },
        { id: 'asc' },
      ],
    });
  });

  it('returns resolved context plus the sanitized preferred organization from current eligibility', async () => {
    prisma.user.findUnique.mockResolvedValue({
      preferredOrganizationId: 'organization-a',
    });
    prisma.organizationMembership.findMany.mockResolvedValue([
      {
        id: 'membership-a',
        role: 'OWNER',
        status: 'ACTIVE',
        organization: {
          id: 'organization-a',
          displayName: 'Organization A',
          status: 'ACTIVE',
        },
      },
      {
        id: 'membership-b',
        role: 'PSYCHOLOGIST',
        status: 'ACTIVE',
        organization: {
          id: 'organization-b',
          displayName: 'Organization B',
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
      status: 'RESOLVED',
      tenantContext,
      preferredOrganizationId: 'organization-a',
    });
    expect(prisma.organizationMembership.findMany).toHaveBeenCalledTimes(1);
  });

  it('returns legacy compatibility with a sanitized null preferred organization when the persisted value is stale', async () => {
    prisma.user.findUnique.mockResolvedValue({
      preferredOrganizationId: 'organization-stale',
    });
    prisma.organizationMembership.findMany.mockResolvedValue([]);

    await expect(service.getTenantContext(user)).resolves.toEqual({
      status: 'LEGACY_COMPATIBILITY',
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
            update: jest.fn().mockResolvedValue({
              preferredOrganizationId: null,
            }),
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
});
