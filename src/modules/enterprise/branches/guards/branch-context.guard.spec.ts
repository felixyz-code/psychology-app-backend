import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { MembershipRole, UserRole } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TenantResolutionMode } from '../../../../common/request-context/request-context.service';
import { BranchContextGuard } from './branch-context.guard';

type TestRequest = {
  headers: Record<string, string | string[] | undefined>;
  tenantContext?: TenantContext;
  branchContext?: {
    branchId: string;
    name: string;
    code: string;
    isPrimary: boolean;
  };
};

describe('BranchContextGuard', () => {
  let guard: BranchContextGuard;
  let prisma: {
    branch: { findFirst: jest.Mock };
    userBranchAccess: { findUnique: jest.Mock };
  };
  let reflector: { getAllAndOverride: jest.Mock };

  const orgId = '22000000-0000-4000-8000-000000000001';
  const branchId = '34000000-0000-4000-8000-000000000001';
  const userId = '23000000-0000-4000-8000-000000000001';

  beforeEach(async () => {
    prisma = {
      branch: { findFirst: jest.fn() },
      userBranchAccess: { findUnique: jest.fn() },
    };
    reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchContextGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: Reflector, useValue: reflector },
      ],
    }).compile();

    guard = module.get<BranchContextGuard>(BranchContextGuard);
  });

  function createMockContext(request: TestRequest): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  it('allows request when no branch is required and no branch header is supplied', async () => {
    const request: TestRequest = {
      headers: {},
      tenantContext: {
        userId,
        organizationId: orgId,
        membershipId: 'mem-1',
        organizationRole: MembershipRole.PSYCHOLOGIST,
        legacyUserRole: UserRole.PSYCHOLOGIST,
        resolutionMode: TenantResolutionMode.EXPLICIT,
      },
    };

    const result = await guard.canActivate(createMockContext(request));
    expect(result).toBe(true);
  });

  it('allows OWNER without requiring explicit UserBranchAccess', async () => {
    const request: TestRequest = {
      headers: { 'x-branch-id': branchId },
      tenantContext: {
        userId,
        organizationId: orgId,
        membershipId: 'mem-1',
        organizationRole: MembershipRole.OWNER,
        legacyUserRole: UserRole.ADMIN,
        resolutionMode: TenantResolutionMode.EXPLICIT,
      },
    };

    prisma.branch.findFirst.mockResolvedValue({
      id: branchId,
      name: 'Sede Central',
      code: 'CDMX-CENTRO',
    });

    const result = await guard.canActivate(createMockContext(request));
    expect(result).toBe(true);
    expect(request.branchContext).toEqual({
      branchId,
      name: 'Sede Central',
      code: 'CDMX-CENTRO',
      isPrimary: false,
    });
    expect(prisma.userBranchAccess.findUnique).not.toHaveBeenCalled();
  });

  it('allows PSYCHOLOGIST when UserBranchAccess exists', async () => {
    const request: TestRequest = {
      headers: { 'x-branch-id': branchId },
      tenantContext: {
        userId,
        organizationId: orgId,
        membershipId: 'mem-1',
        organizationRole: MembershipRole.PSYCHOLOGIST,
        legacyUserRole: UserRole.PSYCHOLOGIST,
        resolutionMode: TenantResolutionMode.EXPLICIT,
      },
    };

    prisma.branch.findFirst.mockResolvedValue({
      id: branchId,
      name: 'Sede Central',
      code: 'CDMX-CENTRO',
    });

    prisma.userBranchAccess.findUnique.mockResolvedValue({
      userId,
      branchId,
      isPrimary: true,
    });

    const result = await guard.canActivate(createMockContext(request));
    expect(result).toBe(true);
    expect(request.branchContext).toEqual({
      branchId,
      name: 'Sede Central',
      code: 'CDMX-CENTRO',
      isPrimary: true,
    });
  });

  it('denies PSYCHOLOGIST with ForbiddenException when UserBranchAccess is absent', async () => {
    const request: TestRequest = {
      headers: { 'x-branch-id': branchId },
      tenantContext: {
        userId,
        organizationId: orgId,
        membershipId: 'mem-1',
        organizationRole: MembershipRole.PSYCHOLOGIST,
        legacyUserRole: UserRole.PSYCHOLOGIST,
        resolutionMode: TenantResolutionMode.EXPLICIT,
      },
    };

    prisma.branch.findFirst.mockResolvedValue({
      id: branchId,
      name: 'Sede Central',
      code: 'CDMX-CENTRO',
    });

    prisma.userBranchAccess.findUnique.mockResolvedValue(null);

    await expect(guard.canActivate(createMockContext(request))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('throws NotFoundException when branch is not found in organization', async () => {
    const request: TestRequest = {
      headers: { 'x-branch-id': 'invalid-branch' },
      tenantContext: {
        userId,
        organizationId: orgId,
        membershipId: 'mem-1',
        organizationRole: MembershipRole.ADMIN,
        legacyUserRole: UserRole.ADMIN,
        resolutionMode: TenantResolutionMode.EXPLICIT,
      },
    };

    prisma.branch.findFirst.mockResolvedValue(null);

    await expect(guard.canActivate(createMockContext(request))).rejects.toThrow(
      NotFoundException,
    );
  });
});
