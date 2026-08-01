import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
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
import { AuthenticatedUser } from './types/authenticated-user.type';
import { CreateFreelancerBootstrapDto } from './dto/create-freelancer-bootstrap.dto';
import { LoginDto } from './dto/login.dto';
import { buildFreelancerBootstrapSlugCandidate } from './freelancer-bootstrap.util';

const BCRYPT_HASH_ROUNDS = 10;
const MAX_BOOTSTRAP_SLUG_ATTEMPTS = 5;
const REGISTRATION_CONFLICT_MESSAGE = 'Registration could not be completed';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly observability: TenantObservabilityService,
  ) {}

  async login(loginDto: LoginDto) {
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

    const accessToken = await this.signIdentityOnlyAccessToken(user);

    return {
      accessToken,
      user: this.toPublicUser(user),
    };
  }

  async freelancerBootstrap(
    dto: CreateFreelancerBootstrapDto,
    ipAddress: string,
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
        const accessToken = await this.signIdentityOnlyAccessToken(result.user);

        return {
          accessToken,
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
    if (tenantContext) {
      return { status: 'RESOLVED' as const, tenantContext };
    }

    const memberships = await this.prisma.organizationMembership.findMany({
      where: {
        userId: user.id,
        status: {
          in: [
            MembershipStatus.INVITED,
            MembershipStatus.ACTIVE,
            MembershipStatus.SUSPENDED,
          ],
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

    if (memberships.length === 0) {
      return {
        status: 'LEGACY_COMPATIBILITY' as const,
        selectableMemberships,
      };
    }

    return { status: 'UNRESOLVED' as const, selectableMemberships };
  }

  private signIdentityOnlyAccessToken(user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
  }) {
    return this.jwtService.signAsync({
      sub: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  }

  private toPublicUser(user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
  }) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
  }
}
