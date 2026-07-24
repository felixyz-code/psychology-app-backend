# Decision Log

## ADR-POST-GO-LIVE.2.1D1: Patients Tenant Policy Alignment

### Status

Implemented for the Patients module only. No production access, deployment,
Prisma schema change, migration, seed change, frontend change, or additional
clinical/financial module conversion is included.

### Decision

Patients now enforces the D0 runtime policy locally: resolved tenant context,
active membership and active organization from the tenant guard, explicit
`patient.*` capability checks, active same-tenant `PatientAssignment`, and the
temporary legacy `psychologistId` restriction. `organizationId` remains the
tenant isolation boundary and legacy `organizationId = NULL` rows remain
invisible through Patients endpoints.

Patient creation supports the freelancer `OWNER` flow by deriving tenant and
legacy psychologist scope from the validated request and creating an active
primary assignment for the current membership. A single membership role remains
sufficient; role accumulation is not introduced.

### Boundary

No route accepts `organizationId` or `psychologistId` as authorization input.
`OWNER` and `ADMIN` roles do not bypass assignment for patient reads, updates
or deletes. `AUDITOR` and `READ_ONLY` receive no patient clinical/personal
projection during this phase. Case Files, Workspace, Session Notes, Documents,
Appointments, Financial Transactions, and Financial Summary remain on their
pre-D1 behavior until their approved phases.

## ADR-POST-GO-LIVE.2.1D0: Clinical and Financial Tenant Conversion Contract

### Status

Approved documentation contract; no runtime implementation, Prisma schema
change, migration, production access, deployment, or D1 work.

### Decision

POST-GO-LIVE.2.1D will convert clinical and financial modules through one
organizational role per membership, explicit capabilities, and clinical
assignment. Roles are not accumulated. A freelancer can operate as `OWNER`
with administrative, operational, clinical, and financial capabilities plus
assignment to their own patients, but an `OWNER` or `ADMIN` does not
automatically gain access to unassigned clinical content.

Clinical content requires valid tenant context, active membership, active
organization, explicit clinical capability, and valid clinical assignment.
`organizationId` is the primary isolation boundary; legacy `psychologistId`
remains only a temporary additional assignment restriction. `AUDITOR` and
`READ_ONLY` have no clinical-content, session-note, or document-download access
during 2.1D.

The normative contract is
`POST_GO_LIVE_2_1D0_TENANT_CONVERSION_CONTRACT.md`. It defines the module
matrix, role matrix, target capabilities, legacy null policy, intra-tenant
relationship validation, HTTP semantics, projections, sanitized observability,
test gates, and D1 through D4 order.

### Boundary

No current route contract is changed in runtime. No capability enum, resolver,
controller, service, DTO, Prisma model, migration, seed, frontend, production
data, deployment, merge, or D1 implementation is part of D0.

## ADR-POST-GO-LIVE.2.1C2: Organization Domain APIs

### Status

Merged and closed before POST-GO-LIVE.2.1D0. This status update records the
baseline transition only; it does not change the approved boundary.

### Decision

Organization APIs reuse the optional tenant foundation and require context only
for organization-selected routes. Invitation recipient actions skip tenant
selection and bind the digest-identified invitation to the authenticated user's
normalized email and optional persisted user binding. Membership and invitation
terminal mutations run in serializable transactions with conditional updates.
The last active OWNER cannot be suspended, removed, or leave; role changes
never grant OWNER because ownership transfer remains outside this phase.

### Boundary

No schema, migration, backfill, production sender, global enforcement, or
clinical module conversion is introduced.

## ADR-POST-GO-LIVE.2.1C1: Invitation Lifecycle Persistence

### Status

Merged before POST-GO-LIVE.2.1D0. No production execution or data backfill is
authorized.

### Decision

Persist invitation recipient identity and lifecycle through `normalizedEmail`,
optional `invitedUserId`, optional `acceptedByUserId`, `rejectedAt`, and
`expiredAt`. State is derived from mutually exclusive terminal timestamps, not
from a status enum. PostgreSQL enforces that invariant and a partial unique
pending key over organization and normalized email. Because a partial index
predicate may not use `now()`, expiry is materialized before a future
equivalent invite is created.

Legacy normalization is deterministic (`lower(btrim(email))`) and fails closed
for blank, overlength, or duplicate terminal-free values. No invitee or
accepting user is inferred. Creation/revocation/rejection actor references are
deferred pending a dedicated audit-data decision.

### Boundary

No controller, service, repository, guard, DTO, endpoint, email sender,
tenant-enforcement behavior, production migration, or production backfill is
part of 2.1C1.

---

## ADR-POST-GO-LIVE.2.1C0: Invitation and Membership Mutation Contract

### Status

Approved contract; documentation-only phase pending controlled merge.

### Decision

Invitation lifecycle needs persistent distinction between recipient rejection,
administrative revocation, and expiry, recipient binding, and database-enforced
active duplicate prevention. ADMIN may create invitations and administer
non-OWNER memberships. AUDITOR sees only sanitized membership/organization
metadata. Rejection permits a new invitation but never reuse; ownership
transfer and real email delivery are excluded. The next steps are a dedicated
2.1C1 Prisma schema/migration review followed by 2.1C2 APIs; the two must not
be combined.

### Boundary

No runtime capability, route, Prisma model, migration, seed, backfill, or
production behavior changes in 2.1C0. Capabilities absent from the approved
matrix remain default-deny.

---

## ADR-POST-GO-LIVE.2.1B: Closed Capability Resolution and Immutable Request Context

### Decision

Organization capabilities are resolved centrally from
`AUTHORIZATION_CAPABILITY_MATRIX.md` using the validated membership role, not
the legacy `User.role`. The resolver returns `ALLOW`, `CONDITIONAL`, or `DENY`.
Only `ALLOW` is usable by the reusable policy guard; every conditional or
unknown capability fails closed until its documented policy is implemented.

TenantContext remains deliberately capability-free. It is frozen once in the
request AsyncLocalStorage store and cannot be silently overwritten. This avoids
turning a per-request policy result into a second long-lived authorization
source. Sanitized telemetry records technical identifiers and reason codes only.

### Boundary

The new capability guard is reusable infrastructure, not a global guard and
not an authorization conversion of Patients or legacy modules. Patients keeps
the existing tenant plus psychologist double barrier. Assignment/redaction and
owner-specific conditional policies, as well as broader clinical enforcement,
remain 2.1D work.

---

## ADR-POST-GO-LIVE.2.1A: Versioned SaaS Authorization Contract

### Decision

`AUTHORIZATION_CONTRACT.md` is the primary source of truth for the next SaaS
implementation stages. The tenant-context and data-isolation ADRs, capability
matrix, endpoint scope matrix, and security-test contract are versioned in
`docs/` and must move together with future authorization changes.

### Boundary

This phase documents the approved target architecture only. It adds no Prisma
schema or migration, runtime guard, service, controller, JWT, API, frontend,
backfill, or tenant-filtering change. The existing tenant-context foundation
and Patients pilot remain the sole implemented tenant-aware behavior.

## ADR-POST-GO-LIVE.1.6: Tenant Context Propagation Strategy

### Context

The backend is transitioning from legacy single-tenant runtime ownership to
SaaS. Existing clinical requests must remain compatible while organization
membership is validated per authenticated request.

### Options considered

* Request-scoped provider: idiomatic but would propagate request scope through
  dependency graphs that do not currently need tenant awareness.
* `AsyncLocalStorage`: retains one request-isolated context for deep services
  and structured logging without altering provider scope.
* Explicit parameters: highly visible and testable, but would require broad,
  premature signature changes across legacy services.

### Decision

Extend the existing request `AsyncLocalStorage` with an immutable Tenant
Context. `TenantContextGuard` resolves it after JWT authentication from
PostgreSQL, then exposes the same object to `@CurrentTenant()` through the
request. This is one resolved value, not two independently mutable sources.

### Consequences and mitigations

The guard performs one indexed membership query per authenticated non-public
request. Cache is deferred because membership revocation, role changes, and
organization suspension require immediate invalidation. Async boundaries are
covered by concurrency tests; context is initialized only by the request
middleware and never by global mutable state.

### Compatibility and evolution

Routes are optional by default, `@Public()` routes bypass resolution, and new
organization-aware routes opt into `@TenantRequired()`. `GET /auth/context` is
intentionally tenant-optional: it returns a resolved context, or the caller's
own selectable memberships when resolution is ambiguous, preventing a client
bootstrap cycle. `User.role` and `psychologistId` remain authoritative for
legacy authorization and ownership. A later phase may enable required context
route by route before adding tenant query enforcement; this ADR does not claim
tenant isolation is complete.

## ADR-POST-GO-LIVE.1.7A: Patients Double-Barrier Pilot

### Decision

Patients is the first tenant-aware clinical module. Every endpoint requires a
resolved TenantContext and receives an immutable `PatientAccessScope` containing
`organizationId` and the authenticated user's legacy `psychologistId`. This
also applies to legacy `UserRole.ADMIN`; membership role remains distinct from
that legacy role. The `organizationId + psychologistId` double barrier is a
temporary strategy until the SaaS migration is complete.

### Consequences

Patient DTOs cannot supply ownership fields. Scoped `updateMany` and
`deleteMany` operations avoid mutations by ID alone, while null organization
records remain intentionally invisible. This is not global enforcement: other
modules keep their legacy ownership behavior. No global Prisma extension,
schema migration, or new index is introduced. A release must independently
certify the backfill of the target database.
