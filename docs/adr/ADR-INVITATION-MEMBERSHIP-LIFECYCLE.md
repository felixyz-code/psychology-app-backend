# ADR: Invitation and Membership Lifecycle

## Status

Accepted for POST-GO-LIVE.2.1C1 design after the 2.1C0 product decision. It
does not change runtime behavior.

## Context

The SaaS foundation contains `OrganizationMembership` and
`OrganizationInvitation`, but the invitation record cannot distinguish
rejection from revocation, bind acceptance durably to a recipient identity, or
enforce one equivalent pending invitation under concurrency. The existing
capability catalog also has no invitation, removal, leave, reactivation, or
ownership-transfer entries.

## Proposed decision

Use a timestamp-derived invitation lifecycle. A future invitation has required
`normalizedEmail`, optional `invitedUserId`, `acceptedByUserId`, `acceptedAt`,
`rejectedAt`, `revokedAt`, `expiredAt`, and `expiresAt`; the terminal timestamps
are mutually exclusive. `EXPIRED` is derived by read-only operations and
materialized as `expiredAt` in the next serializable mutation that encounters
the expiry. Acceptance compares the authenticated user's normalized verified
email and, if present, `invitedUserId`. The only index-active invitation is
PENDING, represented by no terminal timestamp.

2.1C1 should add a PostgreSQL partial unique index over
`(organizationId, normalizedEmail)` where all terminal timestamps are null,
plus a check constraint for mutually exclusive terminal timestamps. PostgreSQL
does not permit a dynamic `expiresAt > now()` index predicate, so each create
transaction must first materialize matching expired PENDING rows, then create.
Prisma cannot express that partial unique index directly, so the reviewed
migration would contain explicit SQL and its test/rollback evidence. No
application-only precheck is a substitute for the database constraint.

The reviewed 2.1C1 migration must use the semantic equivalent of:

```sql
CREATE UNIQUE INDEX organization_invitations_pending_email_key
  ON "organization_invitations" ("organizationId", "normalizedEmail")
  WHERE "acceptedAt" IS NULL
    AND "rejectedAt" IS NULL
    AND "revokedAt" IS NULL
    AND "expiredAt" IS NULL;

ALTER TABLE "organization_invitations"
  ADD CONSTRAINT organization_invitations_one_terminal_state
  CHECK (num_nonnulls("acceptedAt", "rejectedAt", "revokedAt", "expiredAt") <= 1);
```

Rollback drops the named index and constraint only after the application version
that depends on them is no longer deployed; it must not drop invitation data.
The migration review must also record the Prisma introspection result because
the partial index remains SQL-managed.

The migration design is additive: add nullable columns, normalize and preflight
existing invitation emails in a disposable local database, fail on normalized
pending duplicates, populate the new normalized value only after that review,
then add the constraint/index and any `NOT NULL` requirement. Existing accepted
and revoked timestamps are preserved. This is a 2.1C1 migration design, not a
2.1C0 data operation or a production/backfill authorization.

Membership mutations use scoped conditional updates inside serializable Prisma
transactions. The operation re-counts active OWNERS in the transaction and
retries only bounded PostgreSQL serialization failures. Remove and leave set a
terminal membership state rather than deleting the row. They immediately make
tenant resolution ineligible on subsequent requests. Ownership transfer is a
separate operation and is absent unless product approves it.

Remove and leave preserve historical PatientAssignment rows; they do not delete
clinical relationships. A terminal membership target returns `409`, and the
next request loses tenant eligibility. Neither operation terminates an already
running request or invalidates the identity JWT; authorization is checked again
on each request.

## State transitions

| Origin | Action | Destination | Repeat result |
| --- | --- | --- | --- |
| PENDING | accept by bound recipient | ACCEPTED | 409 |
| PENDING | reject by bound recipient | REJECTED | 409 |
| PENDING | revoke by authorized actor | REVOKED | 409 |
| PENDING, expired | accept/reject/revoke/create equivalent | EXPIRED (materialized) | 409 for lifecycle; create may continue |
| ACCEPTED/REJECTED/REVOKED | any lifecycle action | unchanged | 409 |

Unknown tokens return a redacted `404`; known tokens bound to another user
return `403` without identity details. The API must never log the token,
digest, email, authorization header, or request body.

## Approved product decisions

ADMIN may create invitations and manage non-OWNER memberships but may not
promote, degrade, suspend, or remove an OWNER; it may not self-elevate or grant
a privilege above its own. Revocation is OWNER-only. AUDITOR receives sanitized
membership and organization metadata, never clinical data or complete emails.
Rejection persists and permits a fresh invitation, never reuse of the rejected
record. Default expiry is seven days and expiry persists separately from
rejection/revocation. Ownership transfer and real email delivery are outside
the MVP. All unlisted capabilities remain denied.

## Consequences

2.1C1 is required before 2.1C2. It is a local, separately reviewed schema and
migration phase, not a production migration or data backfill. Until then the
existing model and closed typed catalog are authoritative and no organization
API is implemented.
