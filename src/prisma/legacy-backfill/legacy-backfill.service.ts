import {
  MembershipRole,
  OrganizationStatus,
  Prisma,
  PrismaClient,
  UserRole,
} from '@prisma/client';

import { LegacyBackfillManifest } from './manifest';

const requiredSaasMigration = '20260717120000_add_saas_foundation';
const batchSize = 500;

type PrismaExecutor = PrismaClient | Prisma.TransactionClient;

export interface BackfillBlocker {
  code: string;
  entity?: string;
  id?: string;
  detail: string;
}

export interface LegacyBackfillPlan {
  organization: { action: 'create' | 'existing'; id?: string };
  memberships: {
    create: Array<{ userId: string; role: MembershipRole }>;
    existing: number;
  };
  profiles: {
    create: Array<{ userId: string; professionalName: string }>;
    existing: number;
  };
  updates: Record<
    | 'patients'
    | 'caseFiles'
    | 'sessionNotes'
    | 'documents'
    | 'appointments'
    | 'financialTransactions',
    string[]
  >;
  assignments: {
    create: Array<{ patientId: string; psychologistId: string }>;
    existing: number;
  };
  blockers: BackfillBlocker[];
  legacyCounts: LegacyCounts;
}

export interface LegacyCounts {
  users: number;
  patients: number;
  caseFiles: number;
  sessionNotes: number;
  documents: number;
  appointments: number;
  financialTransactions: number;
}

interface LegacySnapshot {
  organizations: Array<{
    id: string;
    slug: string;
    legalName: string;
    displayName: string;
    status: OrganizationStatus;
  }>;
  users: Array<{ id: string; name: string; role: UserRole }>;
  memberships: Array<{
    id: string;
    organizationId: string;
    userId: string;
    role: MembershipRole;
    status: string;
  }>;
  profiles: Array<{ userId: string }>;
  patients: Array<{
    id: string;
    psychologistId: string;
    organizationId: string | null;
  }>;
  caseFiles: Array<{
    id: string;
    organizationId: string | null;
    patient: { organizationId: string | null };
  }>;
  sessionNotes: Array<{
    id: string;
    organizationId: string | null;
    caseFile: { patient: { organizationId: string | null } };
  }>;
  documents: Array<{
    id: string;
    organizationId: string | null;
    caseFile: { patient: { organizationId: string | null } };
  }>;
  appointments: Array<{
    id: string;
    organizationId: string | null;
    patient: { organizationId: string | null };
  }>;
  financialTransactions: Array<{
    id: string;
    organizationId: string | null;
    patient: { id: string; organizationId: string | null } | null;
    appointment: {
      patient: { id: string; organizationId: string | null };
    } | null;
  }>;
  assignments: Array<{
    patientId: string;
    organizationId: string;
    membershipId: string;
    role: string;
    status: string;
  }>;
}

export class BackfillBlockedError extends Error {
  constructor(public readonly plan: LegacyBackfillPlan) {
    super('Legacy backfill preconditions failed');
    this.name = 'BackfillBlockedError';
  }
}

export async function createLegacyBackfillPlan(
  prisma: PrismaExecutor,
  manifest: LegacyBackfillManifest,
) {
  await assertSaasFoundationMigration(prisma);
  return buildLegacyBackfillPlan(await loadSnapshot(prisma), manifest);
}

export async function applyLegacyBackfill(
  prisma: PrismaClient,
  manifest: LegacyBackfillManifest,
) {
  return prisma.$transaction(
    async (transaction) => {
      await assertSaasFoundationMigration(transaction);
      const before = await loadSnapshot(transaction);
      const plan = buildLegacyBackfillPlan(before, manifest);
      if (plan.blockers.length > 0) {
        throw new BackfillBlockedError(plan);
      }

      const organizationId = await executePlan(transaction, plan, manifest);
      const afterPlan = buildLegacyBackfillPlan(
        await loadSnapshot(transaction),
        manifest,
      );
      if (afterPlan.blockers.length > 0 || hasChanges(afterPlan)) {
        throw new Error('Post-apply invariant validation failed');
      }
      if (!sameLegacyCounts(plan.legacyCounts, afterPlan.legacyCounts)) {
        throw new Error('Legacy record counts changed during the backfill');
      }

      return { plan, organizationId, afterPlan };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export function buildLegacyBackfillPlan(
  snapshot: LegacySnapshot,
  manifest: LegacyBackfillManifest,
): LegacyBackfillPlan {
  const blockers: BackfillBlocker[] = [];
  const updates = emptyUpdates();
  const organization = resolveOrganization(snapshot, manifest, blockers);
  const owner = snapshot.users.find(
    (user) => user.id === manifest.owner.userId,
  );

  if (!owner) {
    blockers.push({
      code: 'OWNER_NOT_FOUND',
      entity: 'User',
      id: manifest.owner.userId,
      detail: 'The manifest OWNER does not exist.',
    });
  }
  if (snapshot.users.length === 0 || snapshot.patients.length === 0) {
    blockers.push({
      code: 'NO_LEGACY_DATA',
      detail:
        'The database does not contain the required legacy users and patients.',
    });
  }

  const expectedRoleByUserId = new Map<string, MembershipRole>();
  for (const user of snapshot.users) {
    expectedRoleByUserId.set(
      user.id,
      user.id === manifest.owner.userId
        ? MembershipRole.OWNER
        : user.role === UserRole.PSYCHOLOGIST
          ? MembershipRole.PSYCHOLOGIST
          : MembershipRole.ADMIN,
    );
  }

  for (const patient of snapshot.patients) {
    const psychologist = snapshot.users.find(
      (user) => user.id === patient.psychologistId,
    );
    if (!psychologist || psychologist.role !== UserRole.PSYCHOLOGIST) {
      blockers.push({
        code: 'PATIENT_PSYCHOLOGIST_NOT_ELIGIBLE',
        entity: 'Patient',
        id: patient.id,
        detail:
          'A patient psychologist must be an existing legacy PSYCHOLOGIST user.',
      });
    }
  }

  const memberships = planMemberships(
    snapshot,
    organization.id,
    expectedRoleByUserId,
    blockers,
  );
  const profiles = planProfiles(snapshot);

  for (const patient of snapshot.patients) {
    planOrganizationUpdate(
      'patients',
      patient.id,
      patient.organizationId,
      organization.id,
      organization.id,
      updates,
      blockers,
    );
  }
  for (const caseFile of snapshot.caseFiles) {
    planOrganizationUpdate(
      'caseFiles',
      caseFile.id,
      caseFile.organizationId,
      caseFile.patient.organizationId,
      organization.id,
      updates,
      blockers,
    );
  }
  for (const sessionNote of snapshot.sessionNotes) {
    planOrganizationUpdate(
      'sessionNotes',
      sessionNote.id,
      sessionNote.organizationId,
      sessionNote.caseFile.patient.organizationId,
      organization.id,
      updates,
      blockers,
    );
  }
  for (const document of snapshot.documents) {
    planOrganizationUpdate(
      'documents',
      document.id,
      document.organizationId,
      document.caseFile.patient.organizationId,
      organization.id,
      updates,
      blockers,
    );
  }
  for (const appointment of snapshot.appointments) {
    planOrganizationUpdate(
      'appointments',
      appointment.id,
      appointment.organizationId,
      appointment.patient.organizationId,
      organization.id,
      updates,
      blockers,
    );
  }
  for (const transaction of snapshot.financialTransactions) {
    if (
      transaction.patient &&
      transaction.appointment &&
      transaction.patient.id !== transaction.appointment.patient.id
    ) {
      blockers.push({
        code: 'TRANSACTION_PARENT_CONFLICT',
        entity: 'FinancialTransaction',
        id: transaction.id,
        detail:
          'The transaction patient does not match its appointment patient.',
      });
      continue;
    }
    const inheritedOrganizationId =
      transaction.patient?.organizationId ??
      transaction.appointment?.patient.organizationId ??
      organization.id;
    planOrganizationUpdate(
      'financialTransactions',
      transaction.id,
      transaction.organizationId,
      inheritedOrganizationId,
      organization.id,
      updates,
      blockers,
    );
  }

  const assignments = planAssignments(
    snapshot,
    organization.id,
    memberships,
    blockers,
  );

  return {
    organization:
      organization.action === 'existing'
        ? { action: 'existing', id: organization.id }
        : { action: 'create' },
    memberships,
    profiles,
    updates,
    assignments,
    blockers,
    legacyCounts: countLegacyRecords(snapshot),
  };
}

export function hasChanges(plan: LegacyBackfillPlan) {
  return (
    plan.organization.action === 'create' ||
    plan.memberships.create.length > 0 ||
    plan.profiles.create.length > 0 ||
    plan.assignments.create.length > 0 ||
    Object.values(plan.updates).some((ids) => ids.length > 0)
  );
}

async function executePlan(
  prisma: Prisma.TransactionClient,
  plan: LegacyBackfillPlan,
  manifest: LegacyBackfillManifest,
) {
  const organizationId =
    plan.organization.id ??
    (
      await prisma.organization.create({
        data: {
          slug: manifest.organization.slug,
          legalName: manifest.organization.legalName,
          displayName: manifest.organization.displayName,
          status: manifest.organization.status,
        },
        select: { id: true },
      })
    ).id;

  if (plan.memberships.create.length > 0) {
    await prisma.organizationMembership.createMany({
      data: plan.memberships.create.map((membership) => ({
        organizationId,
        userId: membership.userId,
        role: membership.role,
        status: 'ACTIVE',
        joinedAt: new Date(),
      })),
    });
  }
  if (plan.profiles.create.length > 0) {
    await prisma.psychologistProfile.createMany({
      data: plan.profiles.create.map((profile) => ({
        userId: profile.userId,
        professionalName: profile.professionalName,
        status: 'LEGACY_UNVERIFIED',
      })),
    });
  }

  await updateOrganizationIds(prisma, plan.updates, organizationId);

  if (plan.assignments.create.length > 0) {
    const memberships = await prisma.organizationMembership.findMany({
      where: { organizationId },
      select: { id: true, userId: true },
    });
    const membershipIdByUserId = new Map(
      memberships.map((membership) => [membership.userId, membership.id]),
    );
    const assignmentData = plan.assignments.create.map((assignment) => {
      const membershipId = membershipIdByUserId.get(assignment.psychologistId);
      if (!membershipId) {
        throw new Error(
          'Eligible patient psychologist has no organization membership',
        );
      }
      return {
        organizationId,
        patientId: assignment.patientId,
        membershipId,
        role: 'PRIMARY' as const,
        status: 'ACTIVE' as const,
        creationReason: 'Legacy ownership backfill',
      };
    });
    await prisma.patientAssignment.createMany({ data: assignmentData });
  }

  return organizationId;
}

async function updateOrganizationIds(
  prisma: Prisma.TransactionClient,
  updates: LegacyBackfillPlan['updates'],
  organizationId: string,
) {
  await updateInBatches(updates.patients, (ids) =>
    prisma.patient.updateMany({
      where: { id: { in: ids }, organizationId: null },
      data: { organizationId },
    }),
  );
  await updateInBatches(updates.caseFiles, (ids) =>
    prisma.caseFile.updateMany({
      where: { id: { in: ids }, organizationId: null },
      data: { organizationId },
    }),
  );
  await updateInBatches(updates.sessionNotes, (ids) =>
    prisma.sessionNote.updateMany({
      where: { id: { in: ids }, organizationId: null },
      data: { organizationId },
    }),
  );
  await updateInBatches(updates.documents, (ids) =>
    prisma.document.updateMany({
      where: { id: { in: ids }, organizationId: null },
      data: { organizationId },
    }),
  );
  await updateInBatches(updates.appointments, (ids) =>
    prisma.appointment.updateMany({
      where: { id: { in: ids }, organizationId: null },
      data: { organizationId },
    }),
  );
  await updateInBatches(updates.financialTransactions, (ids) =>
    prisma.financialTransaction.updateMany({
      where: { id: { in: ids }, organizationId: null },
      data: { organizationId },
    }),
  );
}

async function updateInBatches(
  ids: string[],
  update: (batch: string[]) => Promise<{ count: number }>,
) {
  for (let offset = 0; offset < ids.length; offset += batchSize) {
    const batch = ids.slice(offset, offset + batchSize);
    const result = await update(batch);
    if (result.count !== batch.length) {
      throw new Error(
        'A planned organization update was not applied exactly once',
      );
    }
  }
}

function resolveOrganization(
  snapshot: LegacySnapshot,
  manifest: LegacyBackfillManifest,
  blockers: BackfillBlocker[],
) {
  if (snapshot.organizations.length > 1) {
    blockers.push({
      code: 'MULTIPLE_ORGANIZATIONS',
      detail: 'The database already contains more than one organization.',
    });
  }
  const organization = snapshot.organizations[0];
  if (!organization) {
    return { action: 'create' as const, id: undefined };
  }
  if (
    organization.slug !== manifest.organization.slug ||
    organization.legalName !== manifest.organization.legalName ||
    organization.displayName !== manifest.organization.displayName ||
    organization.status !== manifest.organization.status
  ) {
    blockers.push({
      code: 'ORGANIZATION_MANIFEST_CONFLICT',
      entity: 'Organization',
      id: organization.id,
      detail: 'The existing organization differs from the explicit manifest.',
    });
  }
  return { action: 'existing' as const, id: organization.id };
}

function planMemberships(
  snapshot: LegacySnapshot,
  organizationId: string | undefined,
  expectedRoleByUserId: Map<string, MembershipRole>,
  blockers: BackfillBlocker[],
) {
  const create: Array<{ userId: string; role: MembershipRole }> = [];
  let existing = 0;
  for (const user of snapshot.users) {
    const membership = organizationId
      ? snapshot.memberships.find(
          (candidate) =>
            candidate.organizationId === organizationId &&
            candidate.userId === user.id,
        )
      : undefined;
    const expectedRole = expectedRoleByUserId.get(user.id)!;
    if (!membership) {
      create.push({ userId: user.id, role: expectedRole });
      continue;
    }
    if (membership.role !== expectedRole || membership.status !== 'ACTIVE') {
      blockers.push({
        code: 'MEMBERSHIP_CONFLICT',
        entity: 'OrganizationMembership',
        id: membership.id,
        detail:
          'An existing membership has a role or status incompatible with the manifest.',
      });
      continue;
    }
    existing += 1;
  }
  return { create, existing };
}

function planProfiles(snapshot: LegacySnapshot) {
  const existingUserIds = new Set(
    snapshot.profiles.map((profile) => profile.userId),
  );
  const clinicalUsers = snapshot.users.filter(
    (user) => user.role === UserRole.PSYCHOLOGIST,
  );
  return {
    create: clinicalUsers
      .filter((user) => !existingUserIds.has(user.id))
      .map((user) => ({ userId: user.id, professionalName: user.name })),
    existing: clinicalUsers.filter((user) => existingUserIds.has(user.id))
      .length,
  };
}

function planOrganizationUpdate(
  key: keyof LegacyBackfillPlan['updates'],
  id: string,
  actualOrganizationId: string | null,
  inheritedOrganizationId: string | null | undefined,
  fallbackOrganizationId: string | undefined,
  updates: LegacyBackfillPlan['updates'],
  blockers: BackfillBlocker[],
) {
  const expectedOrganizationId =
    inheritedOrganizationId ?? fallbackOrganizationId;
  if (actualOrganizationId === null) {
    updates[key].push(id);
    return;
  }
  if (
    !expectedOrganizationId ||
    actualOrganizationId !== expectedOrganizationId
  ) {
    blockers.push({
      code: 'ORGANIZATION_MISMATCH',
      entity: key,
      id,
      detail:
        'The persisted organizationId differs from its derived organization.',
    });
  }
}

function planAssignments(
  snapshot: LegacySnapshot,
  organizationId: string | undefined,
  memberships: LegacyBackfillPlan['memberships'],
  blockers: BackfillBlocker[],
) {
  const membershipByUserId = new Map(
    snapshot.memberships
      .filter((membership) => membership.organizationId === organizationId)
      .map((membership) => [membership.userId, membership.id]),
  );
  const create: Array<{ patientId: string; psychologistId: string }> = [];
  let existing = 0;
  for (const patient of snapshot.patients) {
    const activePrimary = snapshot.assignments.filter(
      (assignment) =>
        assignment.patientId === patient.id &&
        assignment.role === 'PRIMARY' &&
        assignment.status === 'ACTIVE',
    );
    const membershipId = membershipByUserId.get(patient.psychologistId);
    if (activePrimary.length > 1) {
      blockers.push({
        code: 'MULTIPLE_ACTIVE_PRIMARY_ASSIGNMENTS',
        entity: 'Patient',
        id: patient.id,
        detail:
          'A patient already has more than one active PRIMARY assignment.',
      });
      continue;
    }
    if (activePrimary.length === 1) {
      const assignment = activePrimary[0];
      if (
        assignment.organizationId !== organizationId ||
        (membershipId !== undefined && assignment.membershipId !== membershipId)
      ) {
        blockers.push({
          code: 'PRIMARY_ASSIGNMENT_CONFLICT',
          entity: 'Patient',
          id: patient.id,
          detail:
            'The active PRIMARY assignment does not match legacy ownership.',
        });
      } else {
        existing += 1;
      }
      continue;
    }
    if (
      organizationId &&
      !membershipId &&
      memberships.create.every((item) => item.userId !== patient.psychologistId)
    ) {
      blockers.push({
        code: 'MISSING_PSYCHOLOGIST_MEMBERSHIP',
        entity: 'Patient',
        id: patient.id,
        detail:
          'The patient psychologist has no eligible organization membership.',
      });
      continue;
    }
    create.push({
      patientId: patient.id,
      psychologistId: patient.psychologistId,
    });
  }
  return { create, existing };
}

function emptyUpdates(): LegacyBackfillPlan['updates'] {
  return {
    patients: [],
    caseFiles: [],
    sessionNotes: [],
    documents: [],
    appointments: [],
    financialTransactions: [],
  };
}

function countLegacyRecords(snapshot: LegacySnapshot): LegacyCounts {
  return {
    users: snapshot.users.length,
    patients: snapshot.patients.length,
    caseFiles: snapshot.caseFiles.length,
    sessionNotes: snapshot.sessionNotes.length,
    documents: snapshot.documents.length,
    appointments: snapshot.appointments.length,
    financialTransactions: snapshot.financialTransactions.length,
  };
}

function sameLegacyCounts(left: LegacyCounts, right: LegacyCounts) {
  return Object.entries(left).every(
    ([key, value]) => right[key as keyof LegacyCounts] === value,
  );
}

async function assertSaasFoundationMigration(prisma: PrismaExecutor) {
  const migrations = await prisma.$queryRaw<Array<{ migration_name: string }>>(
    Prisma.sql`SELECT "migration_name" FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL`,
  );
  if (
    !migrations.some(
      (migration) => migration.migration_name === requiredSaasMigration,
    )
  ) {
    throw new Error('The additive SaaS foundation migration is not applied');
  }
}

async function loadSnapshot(prisma: PrismaExecutor): Promise<LegacySnapshot> {
  const [
    organizations,
    users,
    memberships,
    profiles,
    patients,
    caseFiles,
    sessionNotes,
    documents,
    appointments,
    financialTransactions,
    assignments,
  ] = await Promise.all([
    prisma.organization.findMany({
      select: {
        id: true,
        slug: true,
        legalName: true,
        displayName: true,
        status: true,
      },
    }),
    prisma.user.findMany({ select: { id: true, name: true, role: true } }),
    prisma.organizationMembership.findMany({
      select: {
        id: true,
        organizationId: true,
        userId: true,
        role: true,
        status: true,
      },
    }),
    prisma.psychologistProfile.findMany({ select: { userId: true } }),
    prisma.patient.findMany({
      select: { id: true, psychologistId: true, organizationId: true },
    }),
    prisma.caseFile.findMany({
      select: {
        id: true,
        organizationId: true,
        patient: { select: { organizationId: true } },
      },
    }),
    prisma.sessionNote.findMany({
      select: {
        id: true,
        organizationId: true,
        caseFile: { select: { patient: { select: { organizationId: true } } } },
      },
    }),
    prisma.document.findMany({
      select: {
        id: true,
        organizationId: true,
        caseFile: { select: { patient: { select: { organizationId: true } } } },
      },
    }),
    prisma.appointment.findMany({
      select: {
        id: true,
        organizationId: true,
        patient: { select: { organizationId: true } },
      },
    }),
    prisma.financialTransaction.findMany({
      select: {
        id: true,
        organizationId: true,
        patient: { select: { id: true, organizationId: true } },
        appointment: {
          select: { patient: { select: { id: true, organizationId: true } } },
        },
      },
    }),
    prisma.patientAssignment.findMany({
      select: {
        patientId: true,
        organizationId: true,
        membershipId: true,
        role: true,
        status: true,
      },
    }),
  ]);

  return {
    organizations,
    users,
    memberships,
    profiles,
    patients,
    caseFiles,
    sessionNotes,
    documents,
    appointments,
    financialTransactions,
    assignments,
  };
}
