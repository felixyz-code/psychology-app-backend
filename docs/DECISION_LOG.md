# Decision Log

## STATUS-POST-GO-LIVE.3.2: Membership Administration Runtime Implemented

### Status

Accepted as a local runtime status update on branch
`codex/post-go-live-3-2-membership-administration-runtime` from baseline
`2373ff046d56f455ecb9b5c4cc075f36f9ab778f`, pending draft PR review and CI.

### Decision

POST-GO-LIVE.3.2 is no longer schema-gated only. The backend now implements:

- historical membership re-entry through a new membership row per re-entry
  period;
- a PostgreSQL partial unique index that preserves at most one non-terminal
  membership (`INVITED`, `ACTIVE`, `SUSPENDED`) per
  `organizationId + userId` while allowing multiple `REVOKED` rows;
- deterministic tenant-resolution and auth-context membership selection that
  ignores revoked history and never authorizes through suspended memberships;
- invitation acceptance that permits re-entry only when no non-terminal
  membership already exists for the same organization and user;
- a narrowed public membership-status DTO that accepts only `ACTIVE` and
  `SUSPENDED`;
- retained last-active-owner protection and structured organization-domain
  observability across membership role, status, remove, leave, and invitation
  flows.

### Consequences

Membership history is now preserved across remove, leave, revoke, and later
re-entry without reopening the same row. Administrative APIs still list only
current non-terminal memberships, suspended organizations remain fail-closed on
membership routes, and role/status changes continue to take effect on the next
request without requiring a new JWT. Ownership transfer, invitation resend,
frontend switching UX, branding, plans, billing, and production rollout remain
deferred.

## STATUS-POST-GO-LIVE.3.1: Organization Administration Runtime Implemented

### Status

Accepted as a local runtime status update on `development` baseline
`6c8ecbbfb566a1cb8c6b113f5493e04adbf80b12` pending draft PR review.

### Decision

POST-GO-LIVE.3.1 is no longer a future placeholder. The backend now
implements:

- owner-only `PATCH /organizations/:organizationId` for editable identity
  fields;
- owner-only `PATCH /organizations/:organizationId/status` for
  `ACTIVE <-> SUSPENDED`;
- organization read routes that can resolve `ACTIVE` or `SUSPENDED`
  organization state only on the organization administration surface;
- structured organization-domain logging events for update, suspension, and
  reactivation.

The runtime reuses the existing `organization.manage` capability rather than
introducing a new capability enum in 3.1, and it requires no Prisma schema
change or migration.

### Consequences

Suspending an organization still invalidates ordinary tenant-aware business
routes on the next request, but it does not create an irreversible lockout:
an authorized `OWNER` can still read and reactivate the suspended organization
through the narrow administrative routes using the validated
`X-Organization-Id` selector. Membership history re-entry, invitations
expansion, frontend switching UX, branding, plans, billing, and production
rollout remain deferred.

## STATUS-POST-GO-LIVE.3.0: Contract Merged and Baseline Certified

### Status

Accepted as a closeout status update after PR `#35` merged into `development`
at merge commit `7d897ec8db2c5d372fce0b4dc0eaf3bd3b1d4b13`.

### Decision

POST-GO-LIVE.3.0 is closed as a documentation-only, contract-only, and
architecture-only phase. The merged baseline is now
`7d897ec8db2c5d372fce0b4dc0eaf3bd3b1d4b13`.

POST-GO-LIVE.3.0 closure preserves these already-merged decisions without
reopening them:

- active organization remains per-request validated selection;
- JWT remains identity-only and does not carry tenant authority;
- multiple active owners are allowed, but every active organization must retain
  at least one active owner;
- historical membership re-entry remains schema-gated for POST-GO-LIVE.3.2.

### Consequences

POST-GO-LIVE.3.1 becomes the next planned runtime phase, but it remains not
started and not implemented at this closeout point. No runtime route, DTO,
service, controller, Prisma schema, migration, seed, frontend behavior,
infrastructure behavior, production access, deployment, or backfill is approved
by this closeout entry.

## ADR-POST-GO-LIVE.3.0: Organization Administration Starts from a Partial Runtime

### Status

Accepted for POST-GO-LIVE.3.0 as a documentation-only audit and contract
decision. No runtime implementation, schema change, migration, production
access, deployment, or backfill is included.

### Decision

Treat the organization domain as partially implemented, not as a blank future
surface.

The current backend already contains:

- organization read routes;
- membership administration routes;
- invitation lifecycle routes;
- multi-membership tenant selection;
- last-active-owner protection;
- digest-only invitation token persistence;
- acceptance-time membership creation.

POST-GO-LIVE.3 therefore standardizes and extends that real baseline instead of
re-describing it as hypothetical. The 3.0 contract also fixes the active
organization posture: the source of truth remains per-request validated tenant
selection, not a JWT organization claim or mutable server-side tenant session.

### Reason

The repository runtime and OpenAPI surface already exceed the older documents
that still described 2.1C2 routes as unimplemented. Starting 3.0 from the real
state reduces review ambiguity, prevents contract drift, and makes the next
implementation phases focus on the actual gaps:

- organization create/update/lifecycle;
- ownership transfer;
- historical membership re-entry;
- invitation resend;
- optional active-organization preference UX.

### Consequences

POST-GO-LIVE.3.0 records the current organization-domain runtime as an audited
baseline and defines future behavior without weakening D0 through D5 tenant
boundaries. The contract allows multiple active owners, keeps organization
selection stateless and request-validated, forbids generic OWNER grants through
role change or invitation, preserves removal as historical state, and treats
re-entry after removal as a schema-gated historical-lifecycle decision rather
than a silent reactivation.

### Boundary

No runtime route, DTO, service, controller, Prisma schema, migration, seed,
frontend behavior, infrastructure behavior, deployment step, production
operation, or tenant data mutation is approved by this decision.

## ADR-POST-GO-LIVE.2.2: Seed Certified and Postman Runner Deferred

### Status

Seed certification accepted for POST-GO-LIVE.2.2A. Postman collection refresh
accepted as implemented and statically validated for POST-GO-LIVE.2.2B.
Functional Postman runner certification is deferred until a local runner is
approved.

### Decision

Publish POST-GO-LIVE.2.2 as auxiliary development tooling with an explicit
split:

- POST-GO-LIVE.2.2A - Tenant Development Seed: CERTIFIED.
- POST-GO-LIVE.2.2B - Postman Collection Refresh: IMPLEMENTED AND STATICALLY
  VALIDATED.
- Postman functional runner certification: DEFERRED.
- Deferred risk: ACCEPTED AS DEVELOPMENT TOOLING.

The collection is versioned as a development artifact. It must not be described
as functionally executed until a runner can execute the full collection without
cloud publication, API keys, personal sessions, or unacceptable dependency
risk.

### Reason

The tenant-aware platform contract was already covered by D1 through D5
certification, PostgreSQL E2E, Jest regression, and OpenAPI contract tests.
The development seed is deterministic and passed certification twice against
PostgreSQL 16 local with the four existing migrations.

Newman 6.2.2 introduced an unacceptable critical dependency risk for tooling.
Postman CLI 1.44.0 was signed by Postman, Inc., but the observed local run
requested credentials for cloud publication behavior. Postman Desktop 12.20.4
was signed by Postman, Inc., but a personal signed-in session was present and
was not used or modified.

The project should not add critical tooling dependencies, require cloud for
local data certification, or use personal sessions as release evidence.

### Consequences

Release notes, PR text, and roadmap references must distinguish seed
certification from Postman functional execution. The Postman collection does
not replace D1-D5 certification, the E2E suites, or OpenAPI tests.

### Boundary

No Prisma schema, migration, runtime feature, frontend, infrastructure,
production access, deployment, backfill, merge readiness, or POST-GO-LIVE.3
work is included.

## ADR-POST-GO-LIVE.2.1D5: Tenant Platform Certification

### Status

Published for D5-R review. POST-GO-LIVE.2.1D remains open until controlled
review, merge, and closure evidence are accepted.

### Decision

D5 adds a final opt-in tenant platform certification suite and readiness report
for the converted clinical and financial backend surfaces. The certification
validates representative platform invariants instead of adding new product
features or duplicating every D1 through D4 assertion.

The readiness report is
`POST_GO_LIVE_2_1_TENANT_PLATFORM_CERTIFICATION.md`.

### Reason

D1 through D4 independently and jointly certified the converted module
behavior. D5 provides the final review package that confirms the backend
tenant platform is coherent, opt-in testable, and bounded before any broader
closure decision.

### Consequences

Release review must run the D1, D2, D3, D4, D5, tenant PostgreSQL, tenant HTTP,
OpenAPI, and regression gates explicitly because default test commands skip
opt-in suites by design.

### Boundary

No Prisma schema, migration, seed, frontend, infrastructure, production data,
deployment, backfill, global Prisma middleware, RLS, business feature,
auto-merge, merge, or POST-GO-LIVE.3 work is included.

## ADR-POST-GO-LIVE.2.1D4: Integrated Tenant Certification

### Status

Certified locally for integrated D1 through D3 tenant-aware behavior with a
disposable PostgreSQL database and merged before D5. POST-GO-LIVE.2.1D itself
remains open until the later D5-R review, controlled merge, and closure
control.

### Decision

D4 adds an opt-in integrated E2E certification suite that validates the
converted Patients, Case Files, Workspace, Session Notes, Documents/blob
access, Appointments, Financial Transactions, and Financial Summary surfaces
as one tenant-aware contract. It focuses on cross-module invariants rather than
duplicating every D1, D2, and D3 scenario.

The certification keeps `organizationId` as the primary isolation boundary,
requires clinical assignment for clinical content, preserves role/capability
separation, treats appointment notes as clinical content, derives financial
`createdById` server-side, and keeps financial summaries behind
`finance.summary_read`.

### Reason

D1, D2, and D3 were certified independently. D4 proves the independently
converted modules compose correctly for the freelancer owner flow, multi-role
tenant behavior, cross-tenant denial, legacy-null exclusion, document blob
authorization, appointment notes, and financial aggregates.

### Consequences

The backend now has one integrated opt-in certification gate for D1 through D3
tenant behavior. Default Jest and default E2E commands may still skip opt-in
certification suites, so release review must run the D1, D2, D3, tenant
context, and D4 opt-ins explicitly.

### Boundary

No Prisma schema, migration, seed, frontend, infrastructure, production data,
deployment, backfill, global Prisma middleware, RLS, business feature, PR ready
transition, merge, or POST-GO-LIVE.2.1D closure work is included.

## ADR-POST-GO-LIVE.2.1D3: Scheduling and Financial Tenant Conversion

### Status

Certified locally for Appointments, Financial Transactions, and Financial
Summary with disposable PostgreSQL and full local regression. Publication and
draft PR remain required before D3 can be treated as closed. No Prisma schema
change, migration, production access, deployment, frontend change, or D4 work
is included.

### Decision

Appointments now enforce tenant-aware scheduling policy locally. The selected
`organizationId` is derived from resolved tenant context, related patients and
professionals must belong to the selected active organization, and legacy
`organizationId = NULL` appointments remain invisible to lists, direct reads,
updates, and deletes. Appointment scheduling metadata is operational, while
`Appointment.notes` is clinical content.

`RECEPTIONIST` may read and manage operational appointment fields through the
conditional appointment policy, but cannot read, create, or update notes.
`OWNER` and `ADMIN` do not receive appointment notes by role alone. Notes are
projected or mutated only when the actor also has clinical capability plus an
active same-tenant patient assignment. Logs and capability-denial telemetry
must remain sanitized and must never contain notes.

Financial Transactions now enforce tenant-aware CRUD with immutable
`organizationId` predicates. `createdById` is derived server-side from the
authenticated request scope (`scope.userId`); request payload values cannot
choose the creator. Related `patientId` and `appointmentId` values must exist
inside the selected tenant, and a visible but incompatible patient/appointment
pair is rejected as a bad request. General transactions without a patient or
appointment remain permitted.

Financial Summary now requires the explicit `finance.summary_read` capability.
`report.read` and `finance.read` are not substitutes. Summary aggregates and
all supported filters carry the selected `organizationId` predicate, excluding
cross-tenant and legacy-null transactions from counts, sums, and balances.

### Reason

D3 completes the scheduled and financial module conversion required by the D0
contract without changing the database model. It separates operational
scheduling access from clinical notes access, keeps finance authorization based
on financial capabilities rather than clinical assignment, and preserves the
legacy-null fail-closed posture until a separate certified backfill changes
that data state.

### Consequences

Tenant-aware D3 endpoints now converge cross-tenant and legacy-null direct IDs
to redacted `404` responses and use `403` for visible in-tenant capability or
notes-policy denials. Financial writes are attributable to the authenticated
server-side actor, and aggregate calculations cannot broaden beyond the
selected organization through date, type, category, payment-method, patient,
appointment, or creator filters.

### Boundary

No Prisma schema, migration, seed, frontend, infrastructure, production data,
deployment, global Prisma middleware, RLS, backfill, D4 cross-validation, or D5
certification is included. D3 does not create public dashboard/export routes,
tax invoicing, bank reconciliation, billing subscriptions, or a patient portal.

## ADR-POST-GO-LIVE.2.1D2: Clinical Core and Documents Tenant Conversion

### Status

Completed. Case Files, Workspace, Session Notes, Documents, and blob access are
implemented, PostgreSQL certified, regression certified, merged, and closed.
No Prisma schema change, migration, production access, deployment, frontend
change, or D3 work was introduced.

### Decision

Case Files, Workspace, Session Notes, and Documents now enforce the D0
tenant-aware clinical policy locally. Each converted flow requires resolved
tenant context, active membership, active organization, explicit
domain-specific capability, active same-tenant `PatientAssignment`, and the
temporary legacy `psychologistId` restriction. `organizationId` is the tenant
isolation boundary and legacy `organizationId = NULL` rows remain invisible.

Workspace projections carry `organizationId` predicates on included
appointments, session notes, and documents. Session note and document services
derive `organizationId`, `authorId`, and `uploadedById` server-side. Document
download and inline view authorize metadata before filesystem access and
constrain paths to the authorized patient upload folder.

Clinical Core is fully tenant-aware before Organization Management is
introduced as a broader product surface.

### Reason

This preserves backward compatibility while progressively migrating the
platform toward a full SaaS model. The conversion keeps the legacy
psychologist ownership restriction as a temporary additional barrier until the
remaining tenant-aware scheduling, financial, cross-validation, and
certification phases are closed.

### Consequences

Clinical modules share one access policy service for assignment-aware tenant
authorization. Tenant isolation is enforced at the service layer through
`organizationId`, legacy nullable organization records stay invisible to
converted endpoints, and legacy psychologist ownership remains temporarily
preserved. The result remains compatible with the future Organization module
and later tenant certification.

### Boundary

No Prisma schema, migration, seed, production access, deployment, frontend
change, Appointments conversion, Financial conversion, Financial Summary
conversion, D3 work, global Prisma middleware, RLS, or backfill is included.
`OWNER` and `ADMIN` do not bypass assignment. `AUDITOR` and `READ_ONLY` receive
no clinical core or document projection during this phase.

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
