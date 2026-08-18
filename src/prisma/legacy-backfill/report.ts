import { LegacyBackfillManifest } from './manifest';
import { hasChanges, LegacyBackfillPlan } from './legacy-backfill.service';

export function buildBackfillReport(params: {
  mode: 'dry-run' | 'apply';
  manifest: LegacyBackfillManifest;
  plan: LegacyBackfillPlan;
  durationMs: number;
  database: { host: string; port: string; database: string };
  afterCounts?: LegacyBackfillPlan['legacyCounts'];
}) {
  const { mode, manifest, plan, durationMs, database, afterCounts } = params;
  const unchanged = !hasChanges(plan);

  return {
    mode,
    manifestVersion: manifest.version,
    database,
    organization: {
      action: plan.organization.action,
      slug: manifest.organization.slug,
    },
    owner: { userId: manifest.owner.userId },
    usersInspected: plan.legacyCounts.users,
    memberships: {
      toCreate: plan.memberships.create.length,
      existing: plan.memberships.existing,
    },
    psychologistProfiles: {
      toCreate: plan.profiles.create.length,
      existing: plan.profiles.existing,
      deferred: 0,
    },
    organizationIdUpdates: Object.fromEntries(
      Object.entries(plan.updates).map(([entity, ids]) => [entity, ids.length]),
    ),
    patientAssignments: {
      toCreate: plan.assignments.create.length,
      existing: plan.assignments.existing,
    },
    reconciliation: {
      eligiblePatients: plan.legacyCounts.patients,
      compatiblePrimaryAssignments: plan.assignments.existing,
      primaryAssignmentsToCreate: plan.assignments.create.length,
      eligibleUsers: plan.legacyCounts.users,
      compatibleMemberships: plan.memberships.existing,
      membershipsToCreate: plan.memberships.create.length,
    },
    inconsistencies: plan.blockers,
    countsBefore: plan.legacyCounts,
    countsAfter: afterCounts ?? plan.legacyCounts,
    invariants: {
      preconditionsSatisfied: plan.blockers.length === 0,
      legacyCountsPreserved:
        !afterCounts ||
        Object.entries(plan.legacyCounts).every(
          ([key, value]) =>
            afterCounts[key as keyof typeof afterCounts] === value,
        ),
      idempotentState: plan.blockers.length === 0 && unchanged,
      noClinicalContentLogged: true,
    },
    durationMs,
    result:
      plan.blockers.length > 0
        ? 'BLOCKED'
        : unchanged
          ? 'NO_CHANGES'
          : mode === 'dry-run'
            ? 'READY_TO_APPLY'
            : 'APPLIED',
  };
}
