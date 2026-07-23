import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { MembershipStatus, OrganizationStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import {
  TenantContext,
  TenantResolutionMode,
} from '../common/request-context/request-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { ORGANIZATION_ID_HEADER } from './tenant-context.constants';
import { TenantObservabilityService } from './tenant-observability.service';
import {
  TenantResolution,
  TenantResolutionFailure,
} from './tenant-context.types';

type HeaderRequest = {
  headers: Record<string, string | string[] | undefined>;
  rawHeaders?: string[];
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class TenantResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly observability: TenantObservabilityService,
  ) {}

  async resolve(
    user: AuthenticatedUser,
    request: HeaderRequest,
  ): Promise<TenantResolution> {
    let requestedOrganizationId: string | undefined;
    try {
      requestedOrganizationId = getRequestedOrganizationId(request);
    } catch (error) {
      this.observability.invalidHeader(user.id);
      throw error;
    }

    const memberships = await this.prisma.organizationMembership.findMany({
      // Read only this authenticated user's memberships. Status and organization
      // are selected together so eligibility is validated from one DB snapshot.
      where: { userId: user.id },
      select: {
        id: true,
        userId: true,
        organizationId: true,
        role: true,
        status: true,
        organization: { select: { id: true, status: true } },
      },
    });

    if (
      new Set(memberships.map((membership) => membership.organizationId))
        .size !== memberships.length
    ) {
      this.observability.selectionDenied(user.id, 'INCOHERENT_MEMBERSHIP');
      throw new ForbiddenException('Organization access denied');
    }

    if (requestedOrganizationId) {
      const membership = memberships.find(
        (candidate) => candidate.organizationId === requestedOrganizationId,
      );

      if (!membership) {
        // The same response prevents organization enumeration.
        this.observability.selectionDenied(user.id, 'INELIGIBLE_ORGANIZATION');
        throw new ForbiddenException('Organization access denied');
      }

      if (membership.status !== MembershipStatus.ACTIVE) {
        this.observability.selectionDenied(user.id, 'INACTIVE_MEMBERSHIP', {
          membershipId: membership.id,
          organizationId: membership.organizationId,
        });
        throw new ForbiddenException('Organization access denied');
      }

      if (membership.organization.status !== OrganizationStatus.ACTIVE) {
        this.observability.selectionDenied(user.id, 'INACTIVE_ORGANIZATION', {
          membershipId: membership.id,
          organizationId: membership.organizationId,
        });
        throw new ForbiddenException('Organization access denied');
      }

      return {
        tenantContext: this.toContext(
          user,
          membership,
          TenantResolutionMode.EXPLICIT,
        ),
      };
    }

    const eligibleMemberships = memberships.filter(
      (membership) =>
        membership.status === MembershipStatus.ACTIVE &&
        membership.organization.status === OrganizationStatus.ACTIVE,
    );

    if (eligibleMemberships.length === 1) {
      return {
        tenantContext: this.toContext(
          user,
          eligibleMemberships[0],
          TenantResolutionMode.SINGLE_MEMBERSHIP,
        ),
      };
    }

    if (eligibleMemberships.length > 1) {
      return { failure: TenantResolutionFailure.AMBIGUOUS_MEMBERSHIPS };
    }

    if (memberships.length > 0) {
      return { failure: TenantResolutionFailure.INELIGIBLE_ORGANIZATION };
    }

    return { failure: TenantResolutionFailure.NO_ACTIVE_MEMBERSHIP };
  }

  private toContext(
    user: AuthenticatedUser,
    membership: {
      id: string;
      userId: string;
      organizationId: string;
      role: TenantContext['organizationRole'];
      status: MembershipStatus;
      organization: { id: string; status: OrganizationStatus };
    },
    resolutionMode: TenantResolutionMode,
  ): TenantContext {
    if (
      membership.userId !== user.id ||
      membership.organization.id !== membership.organizationId
    ) {
      throw new ForbiddenException('Organization access denied');
    }

    return Object.freeze({
      userId: user.id,
      organizationId: membership.organizationId,
      membershipId: membership.id,
      organizationRole: membership.role,
      legacyUserRole: user.role,
      resolutionMode,
    });
  }
}

function getRequestedOrganizationId(
  request: HeaderRequest,
): string | undefined {
  const values = getHeaderValues(request, ORGANIZATION_ID_HEADER);
  if (values.length === 0) {
    return undefined;
  }

  if (
    values.length !== 1 ||
    typeof values[0] !== 'string' ||
    values[0].includes(',')
  ) {
    throw new BadRequestException('Invalid organization selection header');
  }

  const value = values[0];
  if (!value || !uuidPattern.test(value)) {
    throw new BadRequestException('Invalid organization selection header');
  }

  return value;
}

export function getHeaderValues(
  request: HeaderRequest,
  name: string,
): string[] {
  const rawValues: string[] = [];
  for (let index = 0; index < (request.rawHeaders?.length ?? 0); index += 2) {
    const rawName = request.rawHeaders?.[index];
    const rawValue = request.rawHeaders?.[index + 1];
    if (rawName?.toLowerCase() === name && typeof rawValue === 'string') {
      rawValues.push(rawValue);
    }
  }

  if (rawValues.length > 0) {
    return rawValues;
  }

  const value = request.headers[name];
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}
