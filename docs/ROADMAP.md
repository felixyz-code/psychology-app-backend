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
POST-GO-LIVE.2.1D3 Scheduling & Financial completed
```

Current priorities:

* Backend stabilization
* Frontend development
* Clinical workflow validation
* Docker deployment
* Documentation standardization
* Financial CRUD validation

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
 ├── 2.1D4 Cross Validation              ⏳ PENDIENTE
 └── 2.1D5 Tenant Certification          ⏳ PENDIENTE

POST-GO-LIVE.3                           ⏳
POST-GO-LIVE.4                           ⏳
POST-GO-LIVE.5                           ⏳
POST-GO-LIVE.6                           ⏳
POST-GO-LIVE.7                           ⏳
```

---

# Completed Milestones

## Core Infrastructure

* NestJS backend
* PostgreSQL integration
* Prisma ORM
* JWT authentication
* Swagger documentation
* Docker Compose environment

---

## Clinical Modules

* Authentication
* Users
* Patients
* Case Files
* Session Notes
* Documents
* Appointments

---

## Security

* JWT authentication
* Roles
* Ownership filtering
* UUID identifiers

---

## Infrastructure

* Docker Compose
* Persistent uploads
* PostgreSQL volumes
* Seed support

---

# Current Focus

Current development efforts include:

* Angular frontend
* UI refinement
* Clinical workflow validation
* Documentation improvements
* Financial transactions CRUD validation and basic reporting follow-up
* Controlled legacy SaaS organization backfill validation before any tenant enforcement

---

# Short-Term Roadmap

## Security

* Refresh Tokens
* Password Reset
* Audit Logs
* Standardized Error Responses

---

## Infrastructure

* VPS Deployment
* Production Backups
* External Storage evaluation

---

## Quality

* Unit Tests
* Integration Tests
* Upload Tests
* Ownership Tests

---

## Product

* Search
* Filtering
* Pagination
* User Management improvements
* Advanced financial dashboards
* Bank reconciliation
* Fiscal invoicing support

---

# Medium-Term Roadmap

Potential additions after MVP completion:

* Clinical Templates
* Notifications
* Calendar improvements
* Reporting
* Dashboard enhancements
* Financial reporting

---

# Long-Term Vision

The backend should evolve toward a SaaS platform.

Potential future features:

* Organizations
* Multiple Psychologists
* Multi-tenancy
* Billing
* Subscription Plans
* AI-assisted documentation
* External Object Storage
* Advanced Permissions

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

## Tenant Platform Milestones

Completed:

* ✓ Patients
* ✓ Clinical Core
* Scheduling
* Financial

Remaining:

* Cross Validation
* Certification

## Tenant-Aware Module Matrix

| Module | Tenant-Aware | Status |
| --- | --- | --- |
| Patients | Yes | ✅ |
| Case Files | Yes | ✅ |
| Workspace | Yes | ✅ |
| Session Notes | Yes | ✅ |
| Documents | Yes | ✅ |
| Appointments | Yes | Completed in 2.1D3 |
| Financial Transactions | Yes | Completed in 2.1D3 |
| Financial Summary | Yes | Completed in 2.1D3 |

## Tenant Platform Conversion Progress

| Stage | Status |
| --- | --- |
| Patients | ✅ |
| Clinical Core | ✅ |
| Scheduling | Completed in 2.1D3 |
| Financial | Completed in 2.1D3 |
| Cross Validation | ⏳ |
| Certification | ⏳ |

Using the five POST-GO-LIVE.2.1D execution stages as the roadmap reference:

| Stage | Status |
| --- | --- |
| D1 | ✅ |
| D2 | ✅ |
| D3 | Completed |
| D4 | ⏳ |
| D5 | ⏳ |

The tenant-aware conversion is approximately 60% complete: three of five
POST-GO-LIVE.2.1D stages are closed. This is a technical roadmap reference,
not a productivity metric, and may be adjusted if later stages differ
materially in size.

---

# Known Technical Debt

Current technical debt includes:

* Prisma migrations
* Standard error contract
* Seed improvements
* API examples
* Frontend integration documentation
* Financial reporting and dashboard layers

Recent backend progress:

* Financial transactions CRUD base completed
* Financial transaction filters completed
* Basic financial summary endpoint completed

Technical debt should be addressed incrementally.

---

# Success Criteria

The MVP will be considered complete when:

* Clinical workflow is fully operational.
* Frontend and backend are integrated.
* Documentation is complete.
* Docker deployment is stable.
* VPS deployment is validated.
* The application is ready for production use by an independent psychologist.

---

# References

Related documentation:

* PROJECT.md
* ARCHITECTURE.md
* DATA_MODEL.md
* API.md
* DOCKER.md

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
locally for Appointments, Financial Transactions, and Financial Summary. The
next eligible control is POST-GO-LIVE.2.1D3-R final review, PostgreSQL
certification evidence review, and merge.
