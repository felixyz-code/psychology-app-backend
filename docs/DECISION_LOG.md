# Decision Log

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
