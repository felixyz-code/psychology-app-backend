# Legacy SaaS Backfill Runbook

## Purpose

`POST-GO-LIVE.1.5` prepares a legacy single-tenant database for a later SaaS enforcement phase. It creates one explicit legacy organization, memberships, honest legacy psychologist profiles, nullable `organizationId` values and one active PRIMARY assignment per legacy patient. It does not change runtime authorization, API contracts, `User.role` or `Patient.psychologistId`.

This command is never run by Nest startup, Prisma seed or `prisma migrate deploy`. It must never be used against production without a separately approved release gate.

## Manifest

Copy and fill only the example file; do not commit a real manifest.

```json
{
  "version": 1,
  "organization": {
    "slug": "legacy-practice",
    "legalName": "Legacy Psychology Practice",
    "displayName": "Legacy Practice",
    "status": "ACTIVE"
  },
  "owner": {
    "userId": "explicit-existing-user-uuid"
  }
}
```

The parser rejects unknown fields, unsupported versions, unnormalized slugs, empty names and invalid or absent OWNER IDs. The OWNER is never inferred from role, date, email, patient count or ordering.

The current legacy schema has only `ADMIN` and `PSYCHOLOGIST` user roles and
no account-status field; either role is eligible only when the manifest names
that existing user explicitly. Any absent OWNER blocks the operation.

## Execution

Use a disposable PostgreSQL database whose name ends in `_test`. Migrations must be deployed first and the database must contain legacy users and patients. The command confirms that the additive SaaS foundation migration is present before it reads business data.

```powershell
npm run saas:legacy-backfill -- --manifest path/to/legacy-manifest.json --dry-run
```

Dry-run is the required first operation. It performs every validation and prints only a redacted structured report; it does not write records. Blockers return a non-zero exit status.

```powershell
$env:BACKFILL_CONFIRMATION = 'LEGACY_BACKFILL_APPLY'
npm run saas:legacy-backfill -- --manifest path/to/legacy-manifest.json --apply
```

Apply requires `--apply` and the exact confirmation value. It rejects database names that look production-like. A non-test database also requires the separate `BACKFILL_ALLOW_NON_TEST_DATABASE=true` override, which is for an approved disposable staging environment only and never authorizes production. The report exposes host, port and database name but never the connection URL or credentials.

## Mapping and inheritance

| Entity | Organization source | Rule |
| --- | --- | --- |
| `Patient` | Explicit Legacy Organization | Keep `psychologistId`; set nullable scope. |
| `CaseFile` | Its Patient | Require matching Patient scope. |
| `SessionNote` | Its CaseFile's Patient | Require matching Patient scope. |
| `Document` | Its CaseFile's Patient | Require matching Patient scope. |
| `Appointment` | Its Patient | Require matching Patient scope. |
| `FinancialTransaction` | Patient, then Appointment's Patient, otherwise explicit single legacy organization | Reject contradictory Patient/Appointment parents. |
| `OrganizationMembership` | Explicit manifest and legacy `User.role` | Explicit OWNER becomes `OWNER`; non-owner `PSYCHOLOGIST` becomes `PSYCHOLOGIST`; non-owner `ADMIN` becomes `ADMIN`. |
| `PsychologistProfile` | Legacy `User.role = PSYCHOLOGIST` | Create only when absent, using existing user name and `LEGACY_UNVERIFIED`; no license or specialty is invented. |
| `PatientAssignment` | Patient `psychologistId` and that user's membership | Create one `PRIMARY` / `ACTIVE` assignment; actor fields stay null. |

The global ADMIN mapping does not grant clinical membership. If a selected OWNER is also a legacy psychologist, their explicit OWNER membership remains the assignment reference; `User.role` and their profile remain untouched.

An existing `PsychologistProfile` is treated as compatible and preserved exactly
as stored, including legitimate license or verification data. The backfill
never overwrites or normalizes it. The structured report also reconciles
eligible patients with compatible/existing and planned PRIMARY assignments, and
eligible users with compatible/existing and planned memberships.

## Safety, consistency and idempotence

The command fails closed for a missing OWNER, no legacy data, multiple or conflicting organizations, incompatible memberships, non-psychologist patient owners, parent conflicts, scope mismatches or incompatible active PRIMARY assignments. It reports only entity IDs when needed for diagnosis, never names, emails, notes, documents, passwords or tokens.

Apply repeats prevalidation inside one serializable PostgreSQL transaction. Writes are set-based in batches of at most 500 IDs, while the organization inheritance is computed from the legacy relationship graph before any write. The post-apply plan must contain no changes and legacy row counts must be unchanged, or the transaction rolls back. A correct second apply returns `NO_CHANGES`.

The batches reduce query size, not the duration of the enclosing transaction
or its locks. Before a production release gate, operators must assess volume,
`statement_timeout`, `lock_timeout` and total execution time on a realistic
copy.

## Constraints deferred

No Prisma migration is added in this phase. The partial PostgreSQL unique index for an active PRIMARY assignment and cross-tenant composite foreign keys are intentionally deferred: Prisma does not model the partial index, and the cross-tenant keys would prematurely constrain currently nullable `organizationId` values. A later enforcement phase must backfill, validate and explicitly own those constraints without Prisma drift.

## Non-production rollback

Use this manual procedure only on a disposable environment and only after a backup. Do not run a generic delete command.

1. Confirm that exactly one organization matches the original manifest and that no subsequent SaaS data or memberships were added.
2. Confirm every assignment to remove is `PRIMARY`, `ACTIVE` and has `creationReason = 'Legacy ownership backfill'`.
3. Delete only those verified assignments.
4. Set `organizationId` to `NULL` only for rows scoped to that verified organization, in child-to-parent-safe operational order.
5. Remove only memberships belonging to that verified organization, then the organization itself.
6. Do not automatically delete psychologist profiles: the model has no sufficient profile provenance and a legitimate profile may already exist.
7. Verify the six legacy counts, `psychologistId`, `User.role` and null scopes after rollback.

This procedure intentionally preserves clinical rows and uploaded files.
