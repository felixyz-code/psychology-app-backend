# Roadmap

> Development roadmap for the Psychology Management System Backend.

---

# Purpose

This document describes the current state of the project, upcoming milestones and long-term product direction.

It is not intended to replace the product backlog.

---

# Current Status

Current phase:

```text
MVP Development
```

Tenant platform checkpoint:

```text
POST-GO-LIVE.2.1D5 Tenant Platform Certification published for review
```

Tooling checkpoint:

```text
POST-GO-LIVE.2.2A Tenant Development Seed certified locally
POST-GO-LIVE.2.2B Postman Collection Refresh implemented and statically validated
Postman functional runner certification deferred
```

Organization administration checkpoint:

```text
POST-GO-LIVE.3.0 Organization & Membership Administration Contract merged in PR #35
Merged baseline: 7d897ec8db2c5d372fce0b4dc0eaf3bd3b1d4b13
POST-GO-LIVE.3.1 Organization Administration Runtime implemented locally and in review
POST-GO-LIVE.3.2 Membership Administration Runtime closed and integrated
Runtime baseline: 2373ff046d56f455ecb9b5c4cc075f36f9ab778f
POST-GO-LIVE.3.3 Invitation Administration Runtime closed and integrated
Runtime baseline: 5bb75dc4ae8deed67543f745abb23bac88508066
POST-GO-LIVE.3.4 Organization Ownership Transfer Runtime closed and integrated
Runtime baseline: 77b4b6e6a70ef133459b84ea71c5d9590bfb6d0a
POST-GO-LIVE.3.5 Public Freelancer Bootstrap Runtime closed and integrated
Runtime baseline: 7b456901074807891c0384e214181e2ec8417d37
POST-GO-LIVE.3.6 Preferred Organization UX Runtime implemented locally and pending review as of Sunday, August 2, 2026
```

Current priorities:

- Backend stabilization
- Frontend development
- Clinical workflow validation
- Docker deployment
- Documentation standardization
- Financial CRUD validation

---

# Phase Status

```text
GO-LIVE.0                                COMPLETADO
POST-GO-LIVE.1                           COMPLETADO

POST-GO-LIVE.2
 |- 2.0 Preparacion                      COMPLETADO
 |- 2.1D1 Patients                       COMPLETADO
 |- 2.1D2 Clinical Core                  COMPLETADO
 |- 2.1D3 Scheduling & Financial         COMPLETADO
 |- 2.1D4 Cross Validation               COMPLETADO
 |- 2.1D5 Tenant Certification           D5-R REVIEW
 `- 2.2 Seed & Postman Tooling
    |- 2.2A Tenant Development Seed      CERTIFIED
    `- 2.2B Postman Collection           STATIC VALIDATION; RUNNER DEFERRED

POST-GO-LIVE.3
 |- 3.0 Organization & Membership Contract CLOSED
 |- 3.1 Organization Administration Runtime IMPLEMENTED / IN REVIEW
 |- 3.2 Membership Administration Runtime CLOSED / INTEGRATED
 |- 3.3 Invitation Administration Runtime CLOSED / INTEGRATED
 |- 3.4 Organization Ownership Transfer Runtime CLOSED / INTEGRATED
 |- 3.5 Public Freelancer Bootstrap Runtime CLOSED / INTEGRATED
 `- 3.6 Preferred Organization UX Runtime IMPLEMENTED / REVIEW PENDING
POST-GO-LIVE.4                           PENDING
POST-GO-LIVE.5                           PENDING
POST-GO-LIVE.6                           PENDING
POST-GO-LIVE.7                           PENDING
```

---

D5 status note: Cross Validation / POST-GO-LIVE.2.1D4 is completed and merged.
Tenant Certification / POST-GO-LIVE.2.1D5 is published for D5-R review. The
broader POST-GO-LIVE.2.1D closure remains pending D5-R review, controlled
merge, and post-merge verification.

# Completed Milestones

## Core Infrastructure

- NestJS backend
- PostgreSQL integration
- Prisma ORM
- JWT authentication
- Swagger documentation
- Docker Compose environment

---

## Clinical Modules

- Authentication
- Users
- Patients
- Case Files
- Session Notes
- Documents
- Appointments

---

## Security

- JWT authentication
- Roles
- Ownership filtering
- UUID identifiers

---

## Infrastructure

- Docker Compose
- Persistent uploads
- PostgreSQL volumes
- Seed support

---

# Current Focus

Current development efforts include:

- Angular frontend
- UI refinement
- Clinical workflow validation
- Documentation improvements
- Financial transactions CRUD validation and basic reporting follow-up
- Controlled legacy SaaS organization backfill validation before any tenant enforcement

---

# Short-Term Roadmap

## Security

- Refresh Tokens
- Password Reset
- Audit Logs
- Standardized Error Responses

---

## Infrastructure

- VPS Deployment
- Production Backups
- External Storage evaluation

---

## Quality

- Unit Tests
- Integration Tests
- Upload Tests
- Ownership Tests

---

## Product

- Search
- Filtering
- Pagination
- User Management improvements
- Advanced financial dashboards
- Bank reconciliation
- Fiscal invoicing support

---

# Medium-Term Roadmap

Potential additions after MVP completion:

- Clinical Templates
- Notifications
- Calendar improvements
- Reporting
- Dashboard enhancements
- Financial reporting

---

# Long-Term Vision

The backend should evolve toward a SaaS platform.

Potential future features:

- Organizations
- Multiple Psychologists
- Multi-tenancy
- Billing
- Subscription Plans
- AI-assisted documentation
- External Object Storage
- Advanced Permissions

These features are intentionally outside the current MVP.

## SaaS Transition Status

POST-GO-LIVE.1.5 provides a manifest-driven, reversible-in-disposable-
environments data backfill foundation. It is not tenant isolation: runtime
ownership, APIs and nullable organization scopes remain legacy-compatible.
The next SaaS decision must validate the backfill in PostgreSQL and approve
future tenant enforcement and constraints separately.

POST-GO-LIVE.1.6 adds only tenant-context resolution and propagation. It does
not enforce tenant filters in clinical repositories, replace `psychologistId`,
or make nullable organization references mandatory. The next phase should move
individual routes from optional to required context before changing query
ownership semantics.

POST-GO-LIVE.1.7A makes Patients the first route-by-route tenant-aware pilot:
its endpoints require resolved tenant context and enforce `organizationId AND
psychologistId`. It deliberately leaves nullable legacy records outside the
scope, retains legacy compatibility in all other modules, and requires an
independent target-database backfill certification before deployment.

POST-GO-LIVE.2.1C0 documents the invitation and membership lifecycle required
before organization-domain APIs. It introduces no runtime or schema behavior.
POST-GO-LIVE.2.1C1 added only the reviewed local Prisma schema and migration
for that lifecycle, including a terminal-state constraint and a partial unique
pending-invitation key. It had no production migration or deployment.
POST-GO-LIVE.2.1C2 completed the organization, membership, and invitation APIs
before the 2.1D0 documentation contract.

POST-GO-LIVE.2.1D0 defines the documentation-only contract for converting the
clinical and financial modules after the organization-domain work is closed.
It establishes one organizational role per membership, explicit capabilities,
clinical assignment for clinical content, no automatic `OWNER` or `ADMIN`
clinical access, no 2.1D clinical access for `AUDITOR` or `READ_ONLY`, and the
D1 through D4 implementation order. It introduces no runtime behavior, schema
change, migration, production action, deployment, or D1 implementation.

POST-GO-LIVE.2.1D1 completed the Patients tenant policy alignment. Patients
now requires tenant context, active membership, active organization, explicit
patient capabilities, active clinical assignment, and `organizationId`
isolation while excluding legacy `organizationId = NULL` rows.

POST-GO-LIVE.2.1D2 completed the Clinical Core and Documents tenant conversion
for Case Files, Workspace, Session Notes, Documents, and blob access. It added
a shared `ClinicalAccessPolicyService`, completed the D2 capability catalog,
passed PostgreSQL certification and full regression, and introduced no Prisma
schema changes or migrations.

POST-GO-LIVE.2.1D3 completed and locally certified Scheduling and Financial
tenant conversion for Appointments, Financial Transactions, and Financial
Summary. Appointments now separate operational scheduling from clinical notes,
while Finance uses `finance.read`, `finance.manage`, and
`finance.summary_read` with immutable `organizationId` predicates and
server-derived `createdById`.

POST-GO-LIVE.2.1D4 completed integrated tenant certification for the D1 through
D3 converted modules and is merged to `development`.

POST-GO-LIVE.2.1D5 publishes the final tenant platform certification package
for D5-R review. It validates representative final-platform gates for tenant
context, capabilities, assignments, cross-tenant isolation, legacy-null
exclusion, document blobs, appointment notes, server-owned fields, financial
summaries, OpenAPI server-owned contracts, and readiness reporting. It does
not close POST-GO-LIVE.2.1D; final closure remains pending D5-R review,
controlled merge, post-merge verification, and an explicit closure decision.

## Tenant Platform Milestones

Completed:

- Patients
- Clinical Core
- Scheduling
- Financial
- Cross Validation
- Tenant Certification package published

Remaining:

- D5-R review
- Controlled merge and post-merge verification

Certification note: Cross Validation maps to POST-GO-LIVE.2.1D4 and is
completed and merged. Certification maps to POST-GO-LIVE.2.1D5 and is
published for D5-R review. The broader POST-GO-LIVE.2.1D closure remains
pending D5-R review, controlled merge, and post-merge verification.

## Tenant-Aware Module Matrix

| Module                 | Tenant-Aware | Status             |
| ---------------------- | ------------ | ------------------ |
| Patients               | Yes          | Completed          |
| Case Files             | Yes          | Completed          |
| Workspace              | Yes          | Completed          |
| Session Notes          | Yes          | Completed          |
| Documents              | Yes          | Completed          |
| Appointments           | Yes          | Completed in 2.1D3 |
| Financial Transactions | Yes          | Completed in 2.1D3 |
| Financial Summary      | Yes          | Completed in 2.1D3 |

## Tenant Platform Conversion Progress

| Stage            | Status                    |
| ---------------- | ------------------------- |
| Patients         | Completed                 |
| Clinical Core    | Completed                 |
| Scheduling       | Completed in 2.1D3        |
| Financial        | Completed in 2.1D3        |
| Cross Validation | Completed                 |
| Certification    | Published for D5-R review |

Using the five POST-GO-LIVE.2.1D execution stages as the roadmap reference:

D5 status note: POST-GO-LIVE.2.1D5 is published for D5-R review. Final
POST-GO-LIVE.2.1D closure remains pending controlled review, merge, and
post-merge verification.

| Stage | Status                    |
| ----- | ------------------------- |
| D1    | Completed                 |
| D2    | Completed                 |
| D3    | Completed                 |
| D4    | Completed                 |
| D5    | Published for D5-R review |

The tenant-aware conversion implementation is complete for D1 through D5 from
a local certification perspective, but the broader POST-GO-LIVE.2.1D phase is
not closed until D5-R review, controlled merge, and post-merge verification
are accepted.

---

# Known Technical Debt

Current technical debt includes:

- Prisma migrations
- Standard error contract
- Seed improvements
- API examples
- Frontend integration documentation
- Financial reporting and dashboard layers

Recent backend progress:

- Financial transactions CRUD base completed
- Financial transaction filters completed
- Basic financial summary endpoint completed

Technical debt should be addressed incrementally.

---

# Success Criteria

The MVP will be considered complete when:

- Clinical workflow is fully operational.
- Frontend and backend are integrated.
- Documentation is complete.
- Docker deployment is stable.
- VPS deployment is validated.
- The application is ready for production use by an independent psychologist.

---

# References

Related documentation:

- PROJECT.md
- ARCHITECTURE.md
- DATA_MODEL.md
- API.md
- DOCKER.md

End of document.

---

## POST-GO-LIVE.2.1C2

Organization, membership and invitation API implementation is integrated and
closed. POST-GO-LIVE.2.1D0 is eligible as a documentation-only contract phase.

## POST-GO-LIVE.2.1D0

The tenant conversion contract is documentation-only. The next eligible control
after D0 review and merge is the final contract review before any D1 runtime
work.

## POST-GO-LIVE.2.1D1

Patients tenant policy alignment is integrated, merged, and closed.

## POST-GO-LIVE.2.1D2

Clinical Core and Documents tenant conversion is integrated, PostgreSQL
certified, merged, and closed.

## POST-GO-LIVE.2.1D3

Scheduling and Financial tenant conversion is implemented and certified
locally for Appointments, Financial Transactions, and Financial Summary, and
is merged before D5.

## POST-GO-LIVE.2.1D4

Integrated tenant certification is completed and merged for the converted D1
through D3 modules.

## POST-GO-LIVE.2.1D5

Tenant platform certification is published for D5-R review. The next eligible
control is D5-R review, controlled merge, post-merge verification, and the
explicit POST-GO-LIVE.2.1D closure decision. POST-GO-LIVE.3 remains unstarted.

## POST-GO-LIVE.2.2

Tenant Development Seed & Postman Collection Refresh is an auxiliary tooling
and DX stage after the tenant platform certification package. It does not
reopen POST-GO-LIVE.2, does not start POST-GO-LIVE.3, and introduces no Prisma
schema change, migration, frontend change, infrastructure change, production
access, Organization CRUD, Membership Administration, Invitations, or Switch
Organization behavior.

POST-GO-LIVE.2.2A - Tenant Development Seed:

```text
Status: CERTIFIED
```

Evidence:

- PostgreSQL 16 local real;
- all versioned repository migrations applied and `prisma migrate status`
  reporting the schema up to date;
- seed executed twice;
- deterministic reset;
- `seed:certify` passed twice;
- tenant integrity validated;
- no legacy-null rows created by the seed;
- expected Financial Summary confirmed.

POST-GO-LIVE.2.2B - Postman Collection Refresh:

```text
Status: IMPLEMENTED, VERSIONED, AND LOCALLY CERTIFIABLE
Local postman:certify runner: AVAILABLE
```

Evidence:

- Postman v2.1 collection is valid JSON;
- 14 folders and 93 requests;
- local environment is sanitized;
- URLs use `{{baseUrl}}`;
- dynamic JWT and runtime ID variables are empty in exports;
  endpoints align with the converted tenant-aware clinical and financial
  backend routes;
- `npm.cmd run postman:certify` validates the versioned collection structure
  and executes the preferred-organization UX flow through a repo-local runner
  without Postman Cloud or personal sessions.

The repository still does not require Newman or Postman CLI as the release gate
because Newman added an unacceptable critical dependency risk, Postman CLI
requested authentication / cloud publication behavior during the observed local
run, and Postman Desktop would require using or altering a personal signed-in
session. The collection remains a local development artifact with that
limitation explicit. It does not
replace D1-D5 certification, PostgreSQL E2E, Jest regression, or OpenAPI
contract tests.

## POST-GO-LIVE.3.0

Organization & Membership Administration Contract is the documentation-only
entry phase for POST-GO-LIVE.3. It is now merged and baseline-certified on
`development`.

It:

- audits the real backend organization-domain baseline;
- distinguishes current runtime behavior from missing lifecycle features;
- defines the normative contract for organization identity and lifecycle,
  membership lifecycle, ownership, invitations, and active organization
  selection;
- preserves the D0 through D5 tenant-aware platform invariants;
- introduces no runtime code, schema change, migration, frontend change,
  infrastructure change, production access, deployment, or backfill.

Integration evidence:

- merged by PR `#35`
- merge commit baseline: `7d897ec8db2c5d372fce0b4dc0eaf3bd3b1d4b13`
- merged on `2026-07-29T00:40:25Z`
- post-merge `Backend CI / backend` succeeded on the merge commit
- nature of closure: documentation / contract / architecture only

POST-GO-LIVE.3.0 is therefore closed as a merged specification baseline. It
does not mean that organization administration runtime, membership history
schema work, invitations expansion, or switching UX are already implemented.

The next implementation sequence after closeout is:

1. organization creation and identity administration;
2. membership lifecycle hardening and historical re-entry;
3. invitation resend and ownership transfer;
4. optional active-organization preference UX;
5. organization-domain certification and later frontend work.

POST-GO-LIVE.3.1 is now implemented locally and in review. POST-GO-LIVE.3.2
and POST-GO-LIVE.3.3 are closed and integrated on `development`.
POST-GO-LIVE.3.4 ownership transfer runtime is closed and integrated on
`development` as of Friday, July 31, 2026. POST-GO-LIVE.3.5 public freelancer
bootstrap runtime is closed and integrated on `development` at merge commit
`7b456901074807891c0384e214181e2ec8417d37` on Sunday, August 2, 2026.
POST-GO-LIVE.3.6 preferred organization UX runtime is implemented locally and
pending review as of Sunday, August 2, 2026. No phase in this sequence is
authorized for production until the draft PR, CI, and later review controls
are complete.

## POST-GO-LIVE.3.1

Organization Administration Runtime is the next planned phase after the merged
3.0 contract baseline.

Status:

- IMPLEMENTED / IN REVIEW
- no Prisma migration required
- not authorized for production

Implemented scope:

- administrative organization reads now support `ACTIVE` and `SUSPENDED`
  organization state on organization-specific routes only
- controlled editable organization identity fields:
  `legalName`, `displayName`, `slug`, `timezone`, `locale`, `currency`
- dedicated organization suspension endpoint
- dedicated organization reactivation endpoint
- existing `organization.manage` reused as the owner-only management capability
- structured logging audit hooks for organization update, suspension, and
  reactivation
- unit, OpenAPI, and opt-in E2E coverage for the organization administration
  runtime

Preliminary out of scope:

- membership re-entry schema
- new historical membership rows
- invitation resend and advanced invitation lifecycle
- frontend switching UX
- freelancer public signup
- branding, plans, billing, and custom settings
- production rollout or production backfill

Compatibility notes:

- suspended organizations remain blocked from Patients, Clinical Core,
  Documents, Appointments, and Finance until reactivated
- membership historical re-entry is implemented in POST-GO-LIVE.3.2 and is
  closed/integrated
- invitation administration runtime is implemented in POST-GO-LIVE.3.3 and is
  closed/integrated
- no branding, billing, plans, settings, frontend switching UX, or production
  rollout work is included

## POST-GO-LIVE.3.2

Membership Administration Runtime is the historical-lifecycle hardening phase
that follows the 3.1 organization administration runtime.

Status:

- CLOSED / INTEGRATED
- Prisma migration required and created
- not authorized for production

Implemented scope:

- replaced absolute membership uniqueness with a partial unique active-window
  index in PostgreSQL
- preserved `REVOKED` history and created one new row per membership re-entry
- kept tenant resolution and auth-context deterministic in the presence of
  historical rows
- restricted public membership-status mutations to `ACTIVE` and `SUSPENDED`
- preserved last-active-owner protection under real PostgreSQL concurrency
- updated invitations so revoked history does not block re-entry
- added migration, persistence, unit, and PostgreSQL E2E certification for the
  membership administration runtime

Out of scope:

- direct `POST /memberships`
- broader invitation expansion beyond administration runtime
- ownership transfer
- frontend switching UX
- branding, plans, billing, and custom settings
- production rollout or production backfill

Compatibility notes:

- suspended organizations remain blocked from membership routes
- suspended memberships do not resolve tenant context
- administrative membership listing remains current-state only and does not
  project revoked history
- role and status mutations affect access on the next request without a new
  JWT
- POST-GO-LIVE.3.3 and POST-GO-LIVE.3.4 are closed/integrated

## POST-GO-LIVE.3.4

Organization Ownership Transfer Runtime follows the 3.3 invitation runtime and
keeps the 3.0 organization contract on the existing persistence model.

Status:

- CLOSED / INTEGRATED
- no Prisma migration required
- not authorized for production

Implemented scope:

- dedicated owner-only `POST /organizations/:organizationId/ownership-transfer`
  with the new `ownership.transfer` capability
- serializable compare-and-set promotion/demotion of target and source
  memberships
- deterministic `409` behavior for suspended organizations, self-targeting,
  inactive targets, existing-owner targets, stale actors, and lost concurrency
- post-commit structured observability through
  `organization_ownership_transferred`
- unit, OpenAPI, PostgreSQL E2E, and PostgreSQL concurrency coverage for the
  runtime path

Out of scope:

- Prisma schema change, migration, or primary-owner persistence
- ownership audit table persistence
- broader membership route redesign
- frontend switching UX
- branding, plans, billing, and custom settings
- production rollout or production backfill

Compatibility notes:

- generic membership role patch still never grants `OWNER`
- ownership transfer remains the only public route that can assign `OWNER`
- suspended organizations remain blocked from ordinary membership,
  invitation, clinical, and financial routes
