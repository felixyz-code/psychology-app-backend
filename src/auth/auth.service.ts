import { Injectable, UnauthorizedException } from '@nestjs/common';
import { MembershipStatus, OrganizationStatus } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { TenantContext } from '../common/request-context/request-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from './types/authenticated-user.type';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
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

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async getTenantContext(
    user: AuthenticatedUser,
    tenantContext?: TenantContext,
  ) {
    if (tenantContext) {
      return { status: 'RESOLVED' as const, tenantContext };
    }

    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        role: true,
        status: true,
        organization: {
          select: { id: true, displayName: true, status: true },
        },
      },
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
}
