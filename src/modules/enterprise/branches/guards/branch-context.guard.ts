import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TenantContext } from '../../../../tenant-context/tenant-context.types';

export const BRANCH_REQUIRED_KEY = 'BRANCH_REQUIRED_KEY';
export const BranchRequired = () => SetMetadata(BRANCH_REQUIRED_KEY, true);

export interface ScopedBranchContext {
  branchId: string;
  name: string;
  code: string;
  isPrimary: boolean;
}

type ScopedRequest = {
  headers: Record<string, string | string[] | undefined>;
  params?: Record<string, string | undefined>;
  query?: Record<string, string | undefined>;
  tenantContext?: TenantContext;
  branchContext?: ScopedBranchContext;
};

@Injectable()
export class BranchContextGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isBranchRequired = this.reflector.getAllAndOverride<boolean>(
      BRANCH_REQUIRED_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest<ScopedRequest>();
    const tenant = request.tenantContext;

    if (!tenant) {
      if (isBranchRequired) {
        throw new ForbiddenException('Tenant context is required');
      }
      return true;
    }

    const headerBranchId = request.headers['x-branch-id'];
    const branchIdCandidate =
      (typeof headerBranchId === 'string'
        ? headerBranchId
        : Array.isArray(headerBranchId)
          ? headerBranchId[0]
          : undefined) ||
      request.params?.branchId ||
      (typeof request.query?.branchId === 'string'
        ? request.query.branchId
        : undefined);

    if (!branchIdCandidate) {
      if (isBranchRequired) {
        throw new ForbiddenException(
          'Branch context (X-Branch-Id) is required',
        );
      }
      return true;
    }

    const branch = await this.prisma.branch.findFirst({
      where: {
        id: branchIdCandidate,
        organizationId: tenant.organizationId,
        deletedAt: null,
      },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found in this organization');
    }

    // OWNER and ADMIN hold unrestricted multi-branch authority
    if (
      tenant.organizationRole === MembershipRole.OWNER ||
      tenant.organizationRole === MembershipRole.ADMIN
    ) {
      request.branchContext = {
        branchId: branch.id,
        name: branch.name,
        code: branch.code,
        isPrimary: false,
      };
      return true;
    }

    // Scoped roles must have an explicit UserBranchAccess entry
    const access = await this.prisma.userBranchAccess.findUnique({
      where: {
        userId_branchId: {
          userId: tenant.userId,
          branchId: branch.id,
        },
      },
    });

    if (!access) {
      throw new ForbiddenException('User does not have access to this branch');
    }

    request.branchContext = {
      branchId: branch.id,
      name: branch.name,
      code: branch.code,
      isPrimary: access.isPrimary,
    };

    return true;
  }
}
