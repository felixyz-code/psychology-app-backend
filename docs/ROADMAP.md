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
GO-LIVE.0                                ✅ COMPLETADO
POST-GO-LIVE.1                           ✅ COMPLETADO

POST-GO-LIVE.2
 ├── 2.0 Preparación                     ✅ COMPLETADO
 ├── 2.1D1 Patients                      ✅ COMPLETADO
 ├── 2.1D2 Clinical Core                 ✅ COMPLETADO
 ├── 2.1D3 Scheduling & Financial        COMPLETADO
 ├── 2.1D4 Cross Validation              COMPLETADO
 ├── 2.1D5 Tenant Certification          D5-R REVIEW
 └── 2.2 Seed & Postman Tooling
      ├── 2.2A Tenant Development Seed   CERTIFIED
      └── 2.2B Postman Collection        STATIC VALIDATION; RUNNER DEFERRED

POST-GO-LIVE.3                           NEXT ELIGIBLE PHASE
POST-GO-LIVE.4                           ⏳
POST-GO-LIVE.5                           ⏳
POST-GO-LIVE.6                           ⏳
POST-GO-LIVE.7                           ⏳
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

- ✓ Patients
- ✓ Clinical Core
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
| Patients               | Yes          | ✅                 |
| Case Files             | Yes          | ✅                 |
| Workspace              | Yes          | ✅                 |
| Session Notes          | Yes          | ✅                 |
| Documents              | Yes          | ✅                 |
| Appointments           | Yes          | Completed in 2.1D3 |
| Financial Transactions | Yes          | Completed in 2.1D3 |
| Financial Summary      | Yes          | Completed in 2.1D3 |

## Tenant Platform Conversion Progress

| Stage            | Status                    |
| ---------------- | ------------------------- |
| Patients         | ✅                        |
| Clinical Core    | ✅                        |
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
| D1    | ✅                        |
| D2    | ✅                        |
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
- exactly 4 migrations applied;
- seed executed twice;
- deterministic reset;
- `seed:certify` passed twice;
- tenant integrity validated;
- no legacy-null rows created by the seed;
- expected Financial Summary confirmed.

POST-GO-LIVE.2.2B - Postman Collection Refresh:

```text
Status: IMPLEMENTED AND STATICALLY VALIDATED
Postman functional runner certification: DEFERRED
```

Evidence:

- Postman v2.1 collection is valid JSON;
- 13 folders and 68 requests;
- local environment is sanitized;
- URLs use `{{baseUrl}}`;
- dynamic JWT and runtime ID variables are empty in exports;
- endpoints align with the converted tenant-aware clinical and financial
  backend routes.

The functional Postman runner certification is deferred because Newman added an
unacceptable critical dependency risk, Postman CLI requested authentication /
cloud publication behavior during the observed local run, and Postman Desktop
would require using or altering a personal signed-in session. The collection is
published as a development artifact with that limitation explicit. It does not
replace D1-D5 certification, PostgreSQL E2E, Jest regression, or OpenAPI
contract tests.

POST-GO-LIVE.3 remains the next eligible phase, subject to review acceptance of
the deferred Postman runner risk.
