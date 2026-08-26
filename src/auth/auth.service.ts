import * as crypto from 'crypto';
import { randomUUID } from 'crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import {
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import {
  normalizeEmailIdentity,
  trimEmailPresentation,
} from '../common/identity/email-identity.util';
import { TenantContext } from '../common/request-context/request-context.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  includesUniqueTarget,
  isUniqueViolation,
  serializableTransaction,
} from '../prisma/prisma-transaction.util';
import { TenantObservabilityService } from '../tenant-context/tenant-observability.service';
import { CapabilityResolverService } from '../tenant-context/authorization/capability-resolver.service';
import { projectAuthContextCapabilities } from '../tenant-context/authorization/capability-projection';
import { AuthenticatedUser } from './types/authenticated-user.type';
import { CreateFreelancerBootstrapDto } from './dto/create-freelancer-bootstrap.dto';
import {
  ForgotPasswordDto,
  ForgotPasswordResponseDto,
} from './dto/forgot-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { UpdateAuthContextPreferenceDto } from './dto/auth-context-preference.dto';
import { AuthContextStatus } from './dto/auth-context-response.dto';
import { LoginDto } from './dto/login.dto';
import { buildFreelancerBootstrapSlugCandidate } from './freelancer-bootstrap.util';
import { parseDeviceInfo } from './session-device.util';

const BCRYPT_HASH_ROUNDS = 10;
const MAX_BOOTSTRAP_SLUG_ATTEMPTS = 5;
const REGISTRATION_CONFLICT_MESSAGE = 'Registration could not be completed';
const REFRESH_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function hashTokenSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

function verifySecret(providedSecret: string, storedHash: string): boolean {
  const incomingHash = hashTokenSecret(providedSecret);
  if (incomingHash.length !== storedHash.length) {
    return false;
  }
  return crypto.timingSafeEqual(
    Buffer.from(incomingHash, 'utf8'),
    Buffer.from(storedHash, 'utf8'),
  );
}

class PreferenceEligibilityError extends Error {
  constructor(
    readonly reasonCode:
      | 'INELIGIBLE_ORGANIZATION'
      | 'INACTIVE_MEMBERSHIP'
      | 'INACTIVE_ORGANIZATION',
  ) {
    super(reasonCode);
    this.name = PreferenceEligibilityError.name;
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly observability: TenantObservabilityService,
    private readonly capabilityResolver: CapabilityResolverService,
  ) {}

  async login(loginDto: LoginDto, ipAddress?: string, userAgent?: string) {
    const normalizedEmail = normalizeEmailIdentity(loginDto.email);
    const user = await this.prisma.user.findUnique({
      where: { normalizedEmail },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const { sessionId, refreshToken } = await this.createSession(
      user.id,
      ipAddress,
      userAgent,
    );
    const accessToken = await this.signIdentityAccessToken({
      ...user,
      sessionId,
    });

    return {
      accessToken,
      refreshToken,
      user: this.toPublicUser(user),
    };
  }

  async forgotPassword(
    dto: ForgotPasswordDto,
  ): Promise<ForgotPasswordResponseDto> {
    const normalizedEmail = normalizeEmailIdentity(dto.email);
    // Best practice: Query user without leaking timing/existence
    const user = await this.prisma.user.findUnique({
      where: { normalizedEmail },
      select: { id: true, email: true },
    });

    if (user) {
      // In future subphases: Trigger password reset email workflow
    }

    return {
      success: true,
      message:
        'Si el correo electrónico existe en la plataforma, se enviarán las instrucciones para restablecer el acceso.',
    };
  }

  async freelancerBootstrap(
    dto: CreateFreelancerBootstrapDto,
    ipAddress: string,
    userAgent?: string,
  ) {
    const normalizedEmail = normalizeEmailIdentity(dto.email);
    const email = trimEmailPresentation(dto.email);
    const name = dto.name.trim();
    const organizationName = dto.organizationName.trim();
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_HASH_ROUNDS);

    for (let attempt = 0; attempt < MAX_BOOTSTRAP_SLUG_ATTEMPTS; attempt += 1) {
      const slug = buildFreelancerBootstrapSlugCandidate(
        organizationName,
        attempt,
      );
      try {
        const result = await serializableTransaction(
          this.prisma,
          async (tx) => {
            const existingUser = await tx.user.findUnique({
              where: { normalizedEmail },
              select: { id: true },
            });
            if (existingUser) {
              throw new ConflictException(REGISTRATION_CONFLICT_MESSAGE);
            }

            const user = await tx.user.create({
              data: {
                name,
                email,
                normalizedEmail,
                passwordHash,
                role: UserRole.PSYCHOLOGIST,
              },
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
              },
            });
            const organization = await tx.organization.create({
              data: {
                slug,
                legalName: organizationName,
                displayName: organizationName,
                status: OrganizationStatus.ACTIVE,
              },
              select: {
                id: true,
                slug: true,
                legalName: true,
                displayName: true,
                status: true,
                timezone: true,
                locale: true,
                currency: true,
              },
            });
            const joinedAt = new Date();
            const membership = await tx.organizationMembership.create({
              data: {
                organizationId: organization.id,
                userId: user.id,
                role: MembershipRole.OWNER,
                status: MembershipStatus.ACTIVE,
                joinedAt,
              },
              select: {
                id: true,
                organizationId: true,
                userId: true,
                role: true,
                status: true,
                joinedAt: true,
              },
            });

            return {
              user,
              organization,
              membership,
            };
          },
        );

        this.observability.freelancerBootstrapCompleted({
          userId: result.user.id,
          organizationId: result.organization.id,
          membershipId: result.membership.id,
        });

        const { sessionId, refreshToken } = await this.createSession(
          result.user.id,
          ipAddress,
          userAgent,
        );
        const accessToken = await this.signIdentityAccessToken({
          ...result.user,
          sessionId,
        });

        return {
          accessToken,
          refreshToken,
          user: this.toPublicUser(result.user),
          organization: result.organization,
          membership: result.membership,
        };
      } catch (error) {
        if (error instanceof ConflictException) {
          this.observability.freelancerBootstrapDenied(
            'REGISTRATION_CONFLICT',
            ipAddress,
          );
          throw new ConflictException(REGISTRATION_CONFLICT_MESSAGE);
        }
        if (
          includesUniqueTarget(error, 'slug') &&
          attempt + 1 < MAX_BOOTSTRAP_SLUG_ATTEMPTS
        ) {
          continue;
        }
        if (
          isUniqueViolation(error) &&
          (includesUniqueTarget(error, 'normalizedEmail') ||
            includesUniqueTarget(error, 'email'))
        ) {
          this.observability.freelancerBootstrapDenied(
            'REGISTRATION_CONFLICT',
            ipAddress,
          );
          throw new ConflictException(REGISTRATION_CONFLICT_MESSAGE);
        }
        throw error;
      }
    }

    this.observability.freelancerBootstrapDenied('SLUG_CONFLICT', ipAddress);
    throw new ConflictException(REGISTRATION_CONFLICT_MESSAGE);
  }

  async getTenantContext(
    user: AuthenticatedUser,
    tenantContext?: TenantContext,
  ) {
    const [preferenceState, memberships] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: user.id },
        select: { preferredOrganizationId: true },
      }),
      this.prisma.organizationMembership.findMany({
        where: {
          userId: user.id,
          status: {
            in: [MembershipStatus.ACTIVE, MembershipStatus.SUSPENDED],
          },
        },
        select: {
          id: true,
          userId: true,
          role: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              name: true,
              email: true,
            },
          },
          organization: {
            select: { id: true, displayName: true, status: true },
          },
        },
        orderBy: [
          { organizationId: 'asc' },
          { createdAt: 'desc' },
          { id: 'asc' },
        ],
      }),
    ]);

    const selectableMemberships = memberships
      .filter(
        (membership) =>
          membership.status === MembershipStatus.ACTIVE &&
          membership.organization.status === OrganizationStatus.ACTIVE,
      )
      .map((membership) => ({
        membershipId: membership.id,
        organizationId: membership.organization.id,
        organizationDisplayName: membership.organization.displayName,
        organizationRole: membership.role,
      }));
    const preferredOrganizationId = this.sanitizePreferredOrganizationId(
      preferenceState?.preferredOrganizationId,
      selectableMemberships,
    );
    const baseResponse = {
      schemaVersion: 1 as const,
      tenantContext: null,
      organization: null,
      membership: null,
      capabilities: [] as string[],
      selectableMemberships,
      preferredOrganizationId,
    };

    if (!tenantContext) {
      return {
        ...baseResponse,
        status:
          selectableMemberships.length > 1
            ? AuthContextStatus.AMBIGUOUS_SELECTION
            : AuthContextStatus.NO_ACTIVE_TENANT,
        selectableMemberships:
          selectableMemberships.length > 1 ? selectableMemberships : [],
        preferredOrganizationId:
          selectableMemberships.length > 1 ? preferredOrganizationId : null,
      };
    }

    const currentMembership = memberships.find(
      (membership) =>
        membership.id === tenantContext.membershipId &&
        membership.userId === user.id &&
        membership.organization.id === tenantContext.organizationId,
    );
    if (!currentMembership) {
      throw new ForbiddenException('Organization access denied');
    }

    const isSuspended =
      currentMembership.organization.status === OrganizationStatus.SUSPENDED;
    const isAdministrativeRole =
      currentMembership.role === MembershipRole.OWNER ||
      currentMembership.role === MembershipRole.ADMIN;

    if (isSuspended && !isAdministrativeRole) {
      return {
        ...baseResponse,
        status: AuthContextStatus.NO_ACTIVE_TENANT,
        selectableMemberships: [],
        preferredOrganizationId: null,
      };
    }

    const status = isSuspended
      ? AuthContextStatus.ADMIN_SUSPENDED_CONTEXT
      : AuthContextStatus.ACTIVE_TENANT_READY;
    const membership = {
      id: currentMembership.id,
      userId: currentMembership.userId,
      displayName: currentMembership.user.name ?? null,
      email: normalizeEmailIdentity(currentMembership.user.email),
      role: currentMembership.role,
      status: currentMembership.status,
      createdAt: currentMembership.createdAt,
      updatedAt: currentMembership.updatedAt,
      isCurrentUser: currentMembership.userId === user.id,
    };

    return {
      ...baseResponse,
      status,
      tenantContext: {
        userId: tenantContext.userId,
        organizationId: tenantContext.organizationId,
        membershipId: tenantContext.membershipId,
        organizationRole: tenantContext.organizationRole,
        resolutionMode: tenantContext.resolutionMode,
      },
      organization: currentMembership.organization,
      membership,
      capabilities: projectAuthContextCapabilities(
        currentMembership.role,
        currentMembership.organization.status,
        this.capabilityResolver,
      ),
    };
  }

  async updatePreferredOrganization(
    user: AuthenticatedUser,
    dto: UpdateAuthContextPreferenceDto,
  ) {
    if (dto.organizationId === null) {
      return this.clearPreferredOrganization(user);
    }

    return this.setPreferredOrganization(user, dto.organizationId);
  }

  async rotateRefreshToken(
    dto: RefreshTokenDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const rawToken = dto.refreshToken?.trim();
    if (!rawToken || !rawToken.includes('.')) {
      throw new UnauthorizedException('Invalid refresh token format');
    }

    const [sessionId, tokenSecret] = rawToken.split('.');
    if (!sessionId || !tokenSecret) {
      throw new UnauthorizedException('Invalid refresh token format');
    }

    const session = await this.prisma.userSession.findUnique({
      where: { id: sessionId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Breach Detection 1: Session is already revoked -> Token family invalidation
    if (session.isRevoked) {
      await this.prisma.userSession.updateMany({
        where: { userId: session.userId, isRevoked: false },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
          revokedReason: 'REUSE_BREACH_DETECTED',
        },
      });
      throw new UnauthorizedException(
        'Security breach detected: refresh token reuse on revoked session',
      );
    }

    // Check expiration
    if (session.expiresAt < new Date()) {
      await this.prisma.userSession.update({
        where: { id: session.id },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
          revokedReason: 'EXPIRED',
        },
      });
      throw new UnauthorizedException('Refresh token has expired');
    }

    // Breach Detection 2: Hash mismatch -> Replay/Reuse attempt on rotated session
    const isValidSecret = verifySecret(tokenSecret, session.refreshTokenHash);
    if (!isValidSecret) {
      await this.prisma.userSession.updateMany({
        where: { userId: session.userId, isRevoked: false },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
          revokedReason: 'REUSE_BREACH_DETECTED',
        },
      });
      throw new UnauthorizedException(
        'Security breach detected: refresh token secret mismatch',
      );
    }

    // Issue new secret, update session and rotate
    const newSecret = crypto.randomBytes(32).toString('hex');
    const newHash = hashTokenSecret(newSecret);
    const newRefreshToken = `${session.id}.${newSecret}`;
    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);

    await this.prisma.userSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: newHash,
        lastActiveAt: now,
        expiresAt: newExpiresAt,
        ipAddress: ipAddress ?? session.ipAddress,
        userAgent: userAgent ?? session.userAgent,
        deviceInfo: userAgent ? parseDeviceInfo(userAgent) : session.deviceInfo,
      },
    });

    const accessToken = await this.signIdentityAccessToken({
      ...session.user,
      sessionId: session.id,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: this.toPublicUser(session.user),
    };
  }

  async listActiveSessions(user: AuthenticatedUser) {
    const now = new Date();
    const sessions = await this.prisma.userSession.findMany({
      where: {
        userId: user.id,
        isRevoked: false,
        expiresAt: { gt: now },
      },
      orderBy: { lastActiveAt: 'desc' },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        deviceInfo: true,
        lastActiveAt: true,
        createdAt: true,
      },
    });

    return sessions.map((s) => ({
      ...s,
      isCurrent: s.id === user.sessionId,
    }));
  }

  async revokeSession(user: AuthenticatedUser, sessionId: string) {
    const session = await this.prisma.userSession.findFirst({
      where: {
        id: sessionId,
        userId: user.id,
      },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (!session.isRevoked) {
      await this.prisma.userSession.update({
        where: { id: sessionId },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
          revokedReason: 'MANUAL_REVOCATION',
        },
      });
    }

    return {
      success: true,
      message: 'Session revoked successfully',
    };
  }

  async revokeOtherSessions(user: AuthenticatedUser) {
    const result = await this.prisma.userSession.updateMany({
      where: {
        userId: user.id,
        isRevoked: false,
        ...(user.sessionId ? { id: { not: user.sessionId } } : {}),
      },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: 'MANUAL_REVOCATION',
      },
    });

    return {
      success: true,
      revokedCount: result.count,
      message: 'All other sessions have been revoked',
    };
  }

  async logout(user: AuthenticatedUser) {
    if (user.sessionId) {
      await this.prisma.userSession.updateMany({
        where: {
          id: user.sessionId,
          userId: user.id,
          isRevoked: false,
        },
        data: {
          isRevoked: true,
          revokedAt: new Date(),
          revokedReason: 'LOGOUT',
        },
      });
    }

    return {
      success: true,
      message: 'Logged out successfully',
    };
  }

  private async createSession(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
    client: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const sessionId = randomUUID();
    const tokenSecret = crypto.randomBytes(32).toString('hex');
    const refreshTokenHash = hashTokenSecret(tokenSecret);
    const deviceInfo = parseDeviceInfo(userAgent);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    await client.userSession.create({
      data: {
        id: sessionId,
        userId,
        refreshTokenHash,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        deviceInfo,
        expiresAt,
      },
    });

    const refreshToken = `${sessionId}.${tokenSecret}`;
    return { sessionId, refreshToken };
  }

  private signIdentityAccessToken(user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    isSuperAdmin?: boolean;
    sessionId?: string;
  }) {
    return this.jwtService.signAsync({
      sub: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isSuperAdmin:
        user.role === UserRole.SUPERADMIN || user.isSuperAdmin === true,
      sid: user.sessionId,
    });
  }

  private signIdentityOnlyAccessToken(user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    isSuperAdmin?: boolean;
  }) {
    return this.jwtService.signAsync({
      sub: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isSuperAdmin:
        user.role === UserRole.SUPERADMIN || user.isSuperAdmin === true,
    });
  }

  private toPublicUser(user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    isSuperAdmin?: boolean;
  }) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isSuperAdmin:
        user.role === UserRole.SUPERADMIN || user.isSuperAdmin === true,
    };
  }

  private sanitizePreferredOrganizationId(
    preferredOrganizationId: string | null | undefined,
    selectableMemberships: ReadonlyArray<{ organizationId: string }>,
  ) {
    if (!preferredOrganizationId) {
      return null;
    }

    return selectableMemberships.some(
      (membership) => membership.organizationId === preferredOrganizationId,
    )
      ? preferredOrganizationId
      : null;
  }

  private async clearPreferredOrganization(user: AuthenticatedUser) {
    const result = await serializableTransaction(this.prisma, async (tx) => {
      const currentUser = await tx.user.findUnique({
        where: { id: user.id },
        select: { preferredOrganizationId: true },
      });

      if (!currentUser) {
        throw new UnauthorizedException('Unauthorized');
      }

      const updated = await tx.user.updateMany({
        where: { id: user.id },
        data: { preferredOrganizationId: null },
      });

      if (updated.count !== 1) {
        throw new ConflictException('Concurrent operation conflict');
      }

      return {
        preferredOrganizationId: null,
        previousPreferredOrganizationId: currentUser.preferredOrganizationId,
      };
    });

    this.observability.activeOrganizationPreferenceChanged(
      'SUCCESS',
      'PREFERENCE_CLEARED',
      {
        userId: user.id,
        previousPreferredOrganizationId:
          result.previousPreferredOrganizationId ?? undefined,
      },
    );

    return {
      preferredOrganizationId: result.preferredOrganizationId,
    };
  }

  private async setPreferredOrganization(
    user: AuthenticatedUser,
    organizationId: string,
  ) {
    try {
      const result = await serializableTransaction(this.prisma, async (tx) => {
        const [currentUser, membership] = await Promise.all([
          tx.user.findUnique({
            where: { id: user.id },
            select: { preferredOrganizationId: true },
          }),
          tx.organizationMembership.findFirst({
            where: {
              userId: user.id,
              organizationId,
            },
            select: {
              id: true,
              status: true,
              organization: {
                select: {
                  status: true,
                },
              },
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          }),
        ]);

        if (!currentUser) {
          throw new UnauthorizedException('Unauthorized');
        }

        if (!membership) {
          throw new PreferenceEligibilityError('INELIGIBLE_ORGANIZATION');
        }

        if (membership.status !== MembershipStatus.ACTIVE) {
          throw new PreferenceEligibilityError('INACTIVE_MEMBERSHIP');
        }

        if (membership.organization.status !== OrganizationStatus.ACTIVE) {
          throw new PreferenceEligibilityError('INACTIVE_ORGANIZATION');
        }

        const updated = await tx.user.updateMany({
          where: { id: user.id },
          data: { preferredOrganizationId: organizationId },
        });

        if (updated.count !== 1) {
          throw new ConflictException('Concurrent operation conflict');
        }

        return {
          preferredOrganizationId: organizationId,
          previousPreferredOrganizationId: currentUser.preferredOrganizationId,
        };
      });

      this.observability.activeOrganizationPreferenceChanged(
        'SUCCESS',
        'PREFERENCE_UPDATED',
        {
          userId: user.id,
          preferredOrganizationId: result.preferredOrganizationId,
          previousPreferredOrganizationId:
            result.previousPreferredOrganizationId ?? undefined,
        },
      );

      return {
        preferredOrganizationId: result.preferredOrganizationId,
      };
    } catch (error) {
      if (error instanceof PreferenceEligibilityError) {
        this.observability.activeOrganizationPreferenceChanged(
          'DENY',
          error.reasonCode,
          {
            userId: user.id,
            preferredOrganizationId: organizationId,
          },
        );
        throw new NotFoundException('Organization not found');
      }

      throw error;
    }
  }
}
