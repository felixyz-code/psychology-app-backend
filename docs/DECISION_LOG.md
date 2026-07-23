# Decision Log

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
