import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  MembershipStatus,
  OrganizationStatus,
  PlanTier,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../../audit-logs/audit-logs.service';
import { AuditLogsQueryDto } from '../../audit-logs/dto/audit-logs-query.dto';
import { EntitlementKey } from '../../entitlements/entitlements.constants';
import {
  AdminTenantListItemDto,
  ExtendTenantTrialDto,
  FreezeTenantDto,
  GrantLifetimeSponsorDto,
  PlatformMetricsResponseDto,
  UpdateTenantQuotasDto,
} from '../dto/admin-tenants.dto';

@Injectable()
export class AdminTenantsService {
  private readonly logger = new Logger(AdminTenantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Consolidates all organizations with their latest subscription status,
   * quota overrides, usage counts, and partner sponsorship metadata.
   */
  async listTenants(): Promise<AdminTenantListItemDto[]> {
    const orgs = await this.prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            plan: {
              include: {
                entitlements: {
                  include: {
                    definition: true,
                  },
                },
              },
            },
          },
        },
        _count: {
          select: {
            patients: true,
            branches: {
              where: { deletedAt: null },
            },
            memberships: {
              where: { status: MembershipStatus.ACTIVE },
            },
          },
        },
      },
    });

    return orgs.map((org) => {
      const latestSub = org.subscriptions[0] ?? null;

      let therapistsLimit = 1;
      let patientsLimit = 50;
      let branchesLimit = 1;

      if (latestSub?.plan) {
        const staffEnt = latestSub.plan.entitlements.find(
          (e) => e.definition.key === EntitlementKey.MAX_STAFF_SEATS,
        );
        const patEnt = latestSub.plan.entitlements.find(
          (e) => e.definition.key === EntitlementKey.MAX_PATIENTS,
        );
        const branchEnt = latestSub.plan.entitlements.find(
          (e) => e.definition.key === EntitlementKey.MAX_BRANCHES,
        );

        therapistsLimit = staffEnt?.numericValue ?? 1;
        patientsLimit = patEnt?.numericValue ?? 50;
        branchesLimit = branchEnt?.numericValue ?? 1;
      }

      // Override with custom quotas if defined
      if (
        latestSub?.customTherapistsLimit !== undefined &&
        latestSub?.customTherapistsLimit !== null
      ) {
        therapistsLimit = latestSub.customTherapistsLimit;
      }
      if (
        latestSub?.customPatientsLimit !== undefined &&
        latestSub?.customPatientsLimit !== null
      ) {
        patientsLimit = latestSub.customPatientsLimit;
      }
      if (
        latestSub?.customBranchesLimit !== undefined &&
        latestSub?.customBranchesLimit !== null
      ) {
        branchesLimit = latestSub.customBranchesLimit;
      }

      return {
        id: org.id,
        slug: org.slug,
        displayName: org.displayName,
        legalName: org.legalName,
        status: org.status,
        timezone: org.timezone,
        createdAt: org.createdAt,
        subscription: latestSub
          ? {
              id: latestSub.id,
              status: latestSub.status,
              planTier: latestSub.plan.tier,
              planCode: latestSub.plan.code,
              planName: latestSub.plan.name,
              trialEndsAt: latestSub.trialEndsAt,
              currentPeriodEndsAt: latestSub.currentPeriodEndsAt,
              isExempt: latestSub.isExempt,
              sponsorNotes: latestSub.sponsorNotes,
              customTherapistsLimit: latestSub.customTherapistsLimit,
              customPatientsLimit: latestSub.customPatientsLimit,
              customBranchesLimit: latestSub.customBranchesLimit,
            }
          : null,
        usage: {
          therapistsCount: org._count.memberships,
          patientsCount: org._count.patients,
          branchesCount: org._count.branches,
          therapistsLimit,
          patientsLimit,
          branchesLimit,
        },
      };
    });
  }

  /**
   * Extends the trial duration for an organization by a specified number of days.
   */
  async extendTrial(organizationId: string, dto: ExtendTenantTrialDto) {
    const daysToAdd = dto.daysToAdd ?? 14;

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!org) {
      throw new NotFoundException(
        `Organization with ID "${organizationId}" not found`,
      );
    }

    const latestSub = org.subscriptions[0];
    const now = new Date();

    if (!latestSub) {
      // Find default free/pro plan to create a subscription
      const defaultPlan = await this.prisma.plan.findFirst({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      });

      if (!defaultPlan) {
        throw new NotFoundException('No active subscription plans found');
      }

      const trialEndsAt = new Date(now);
      trialEndsAt.setDate(trialEndsAt.getDate() + daysToAdd);

      const created = await this.prisma.subscription.create({
        data: {
          organizationId: org.id,
          planId: defaultPlan.id,
          status: SubscriptionStatus.TRIALING,
          trialStartedAt: now,
          trialEndsAt,
          currentPeriodStartedAt: now,
          currentPeriodEndsAt: trialEndsAt,
        },
        include: { plan: true },
      });

      this.logger.log({
        event: 'superadmin_extend_trial_created_sub',
        organizationId,
        subscriptionId: created.id,
        daysToAdd,
        trialEndsAt,
      });

      return created;
    }

    const baseDate =
      latestSub.trialEndsAt && latestSub.trialEndsAt > now
        ? new Date(latestSub.trialEndsAt)
        : new Date(now);

    baseDate.setDate(baseDate.getDate() + daysToAdd);

    const updated = await this.prisma.subscription.update({
      where: { id: latestSub.id },
      data: {
        status: SubscriptionStatus.TRIALING,
        trialEndsAt: baseDate,
        currentPeriodEndsAt: baseDate,
        canceledAt: null,
        endedAt: null,
      },
      include: { plan: true },
    });

    this.logger.log({
      event: 'superadmin_extend_trial',
      organizationId,
      subscriptionId: updated.id,
      daysToAdd,
      trialEndsAt: updated.trialEndsAt,
    });

    return updated;
  }

  /**
   * Grants lifetime sponsorship access to an allied organization or institution.
   */
  async grantLifetime(organizationId: string, dto: GrantLifetimeSponsorDto) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!org) {
      throw new NotFoundException(
        `Organization with ID "${organizationId}" not found`,
      );
    }

    const distantFuture = new Date('2099-12-31T23:59:59.999Z');
    const now = new Date();
    const latestSub = org.subscriptions[0];

    if (!latestSub) {
      const enterprisePlan =
        (await this.prisma.plan.findFirst({
          where: { tier: PlanTier.ENTERPRISE, isActive: true },
        })) ??
        (await this.prisma.plan.findFirst({
          where: { isActive: true },
          orderBy: { sortOrder: 'desc' },
        }));

      if (!enterprisePlan) {
        throw new NotFoundException('No active plan catalog found');
      }

      const created = await this.prisma.subscription.create({
        data: {
          organizationId: org.id,
          planId: enterprisePlan.id,
          status: SubscriptionStatus.LIFETIME_SPONSOR,
          isExempt: true,
          sponsorNotes: dto.sponsorNotes,
          customTherapistsLimit: dto.customTherapistsLimit,
          customPatientsLimit: dto.customPatientsLimit,
          customBranchesLimit: dto.customBranchesLimit,
          currentPeriodStartedAt: now,
          currentPeriodEndsAt: distantFuture,
        },
        include: { plan: true },
      });

      this.logger.log({
        event: 'superadmin_grant_lifetime_created',
        organizationId,
        subscriptionId: created.id,
        sponsorNotes: dto.sponsorNotes,
      });

      return created;
    }

    const updated = await this.prisma.subscription.update({
      where: { id: latestSub.id },
      data: {
        status: SubscriptionStatus.LIFETIME_SPONSOR,
        isExempt: true,
        sponsorNotes: dto.sponsorNotes ?? latestSub.sponsorNotes,
        customTherapistsLimit:
          dto.customTherapistsLimit !== undefined
            ? dto.customTherapistsLimit
            : latestSub.customTherapistsLimit,
        customPatientsLimit:
          dto.customPatientsLimit !== undefined
            ? dto.customPatientsLimit
            : latestSub.customPatientsLimit,
        customBranchesLimit:
          dto.customBranchesLimit !== undefined
            ? dto.customBranchesLimit
            : latestSub.customBranchesLimit,
        currentPeriodEndsAt: distantFuture,
        canceledAt: null,
        endedAt: null,
        cancelReason: null,
      },
      include: { plan: true },
    });

    this.logger.log({
      event: 'superadmin_grant_lifetime',
      organizationId,
      subscriptionId: updated.id,
      sponsorNotes: updated.sponsorNotes,
    });

    return updated;
  }

  /**
   * Manually sets custom quota limits for therapists, patients, and branches.
   */
  async updateQuotas(organizationId: string, dto: UpdateTenantQuotasDto) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!org) {
      throw new NotFoundException(
        `Organization with ID "${organizationId}" not found`,
      );
    }

    const latestSub = org.subscriptions[0];
    if (!latestSub) {
      throw new NotFoundException(
        `No subscription found for organization "${organizationId}"`,
      );
    }

    const updated = await this.prisma.subscription.update({
      where: { id: latestSub.id },
      data: {
        customTherapistsLimit: dto.customTherapistsLimit,
        customPatientsLimit: dto.customPatientsLimit,
        customBranchesLimit: dto.customBranchesLimit,
      },
      include: { plan: true },
    });

    this.logger.log({
      event: 'superadmin_update_quotas',
      organizationId,
      subscriptionId: updated.id,
      customTherapistsLimit: updated.customTherapistsLimit,
      customPatientsLimit: updated.customPatientsLimit,
      customBranchesLimit: updated.customBranchesLimit,
    });

    return updated;
  }

  /**
   * Freezes or unfreezes tenant account access.
   */
  async freezeTenant(organizationId: string, dto: FreezeTenantDto) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!org) {
      throw new NotFoundException(
        `Organization with ID "${organizationId}" not found`,
      );
    }

    const latestSub = org.subscriptions[0];

    if (dto.freeze) {
      await this.prisma.organization.update({
        where: { id: org.id },
        data: { status: OrganizationStatus.SUSPENDED },
      });

      if (latestSub) {
        await this.prisma.subscription.update({
          where: { id: latestSub.id },
          data: {
            status: SubscriptionStatus.FROZEN,
            cancelReason: dto.reason ?? 'Account frozen by SuperAdmin',
          },
        });
      }

      this.logger.warn({
        event: 'superadmin_freeze_tenant',
        organizationId,
        reason: dto.reason,
      });

      return {
        success: true,
        isFrozen: true,
        message: 'Organización congelada exitosamente.',
      };
    } else {
      await this.prisma.organization.update({
        where: { id: org.id },
        data: { status: OrganizationStatus.ACTIVE },
      });

      if (latestSub && latestSub.status === SubscriptionStatus.FROZEN) {
        const targetStatus = latestSub.isExempt
          ? SubscriptionStatus.LIFETIME_SPONSOR
          : SubscriptionStatus.ACTIVE;

        await this.prisma.subscription.update({
          where: { id: latestSub.id },
          data: {
            status: targetStatus,
            cancelReason: null,
          },
        });
      }

      this.logger.log({
        event: 'superadmin_unfreeze_tenant',
        organizationId,
      });

      return {
        success: true,
        isFrozen: false,
        message: 'Organización descongelada y reactivada exitosamente.',
      };
    }
  }

  /**
   * Fetches global platform audit logs across all organizations and system events.
   */
  async getGlobalAuditLogs(query: AuditLogsQueryDto) {
    const fromDate = query.from
      ? new Date(query.from)
      : query.startDate
        ? new Date(query.startDate)
        : undefined;
    const toDate = query.to
      ? new Date(query.to)
      : query.endDate
        ? new Date(query.endDate)
        : undefined;

    return this.auditLogService.findAll({
      organizationId: query.tenantId,
      branchId: query.branchId,
      userId: query.userId,
      resourceType: query.resourceType,
      resourceId: query.resourceId,
      resource: query.resource,
      action: query.action,
      severity: query.severity,
      search: query.search,
      from: fromDate,
      to: toDate,
      limit: query.limit,
      offset: query.offset,
    });
  }

  /**
   * Calculates platform health, tenant counts, activity aggregates, and memory telemetry.
   */
  async getPlatformMetrics(): Promise<PlatformMetricsResponseDto> {
    const [
      totalOrgs,
      activeOrgs,
      suspendedOrgs,
      trialingSubs,
      lifetimeSubs,
      activeSubs,
      totalPatients,
      totalAppointments,
      totalUsers,
    ] = await Promise.all([
      this.prisma.organization.count(),
      this.prisma.organization.count({
        where: { status: OrganizationStatus.ACTIVE },
      }),
      this.prisma.organization.count({
        where: { status: OrganizationStatus.SUSPENDED },
      }),
      this.prisma.subscription.count({
        where: { status: SubscriptionStatus.TRIALING },
      }),
      this.prisma.subscription.count({
        where: { status: SubscriptionStatus.LIFETIME_SPONSOR },
      }),
      this.prisma.subscription.count({
        where: { status: SubscriptionStatus.ACTIVE },
      }),
      this.prisma.patient.count({
        where: { deletedAt: null },
      }),
      this.prisma.appointment.count(),
      this.prisma.user.count(),
    ]);

    const mem = process.memoryUsage();

    return {
      status: 'HEALTHY',
      uptimeSeconds: Math.floor(process.uptime()),
      serverTimestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      databaseStatus: 'ONLINE',
      tenants: {
        total: totalOrgs,
        active: activeOrgs,
        suspended: suspendedOrgs,
        trialing: trialingSubs,
        lifetime: lifetimeSubs,
        activeSubscriptions: activeSubs,
      },
      aggregates: {
        totalPatients,
        totalAppointments,
        totalUsers,
      },
      memory: {
        heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
        rssMB: Math.round(mem.rss / 1024 / 1024),
      },
    };
  }
}
