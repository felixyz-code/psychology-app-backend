# Changelog

---

# POST-GO-LIVE.3.2 Membership Administration Runtime

## Status

Implemented locally and pending technical review, draft PR publication, and CI.

## Highlights

* Replaced the absolute `OrganizationMembership` uniqueness on
  `organizationId + userId` with a PostgreSQL partial unique index that allows
  multiple historical `REVOKED` rows while preserving at most one non-terminal
  row (`INVITED`, `ACTIVE`, `SUSPENDED`).
* Added a dedicated Prisma migration
  `20260729030000_membership_historical_reentry` with an explicit preflight
  guard for unsafe legacy duplicate non-terminal rows.
* Hardened tenant resolution and `GET /auth/context` so historical `REVOKED`
  rows are ignored deterministically and suspended memberships never authorize
  tenant context.
* Restricted the public membership-status DTO and Swagger contract to
  `ACTIVE` and `SUSPENDED` only.
* Kept membership administration listing behavior focused on current
  non-terminal rows while preserving full historical membership periods in the
  database.
* Updated invitation acceptance so revoked history no longer blocks re-entry;
  the accepted invitation creates a new `ACTIVE` membership row instead of
  reactivating the revoked record.
* Extended unit, persistence, migration, and PostgreSQL E2E coverage for
  historical re-entry, partial-index conflicts, target-policy hardening, and
  last-owner concurrency.

## Compatibility

* No new public `POST /memberships` route.
* No frontend changes.
* No infrastructure changes.
* No production access.
* No deployment or backfill activity.
* POST-GO-LIVE.3.2 is closed and integrated as the organization-domain
  baseline.
* POST-GO-LIVE.3.3 invitation administration runtime is implemented locally and
  review pending as of Wednesday, July 29, 2026.

# POST-GO-LIVE.3.3 Invitation Administration Runtime

## Status

Implemented locally without a Prisma migration. Review pending.

## Highlights

* Added hardened administrative invitation listing with derived
  `logicalStatus`, sanitized projections, and deterministic ordering.
* Hardened invitation creation so `OWNER` is rejected in both DTO and service,
  logically expired duplicates are materialized before insert, and known
  recipients with `INVITED`, `ACTIVE`, or `SUSPENDED` memberships fail closed.
* Added owner-only `POST /organizations/:organizationId/invitations/:invitationId/resend`
  with replacement semantics, fresh token generation, and post-commit
  `invitation_resent` observability.
* Hardened accept/reject flows with canonicalized recipient email checks,
  organization-active enforcement, exactly-once terminal transitions, and
  historical membership re-entry via a new membership row.
* Extended unit, persistence, and PostgreSQL E2E/concurrency coverage for
  invitation administration runtime scenarios.

## Compatibility

* No Prisma schema change.
* No new migration.
* No real email delivery.
* No frontend change.
* No production access or deployment.

# POST-GO-LIVE.3.1 Organization Administration Runtime

## Status

Implemented locally and in review as the first runtime phase after the merged
POST-GO-LIVE.3.0 contract baseline.

## Highlights

* Added owner-only `PATCH /organizations/:organizationId` for editable
  organization identity fields: `legalName`, `displayName`, `slug`,
  `timezone`, `locale`, and `currency`.
* Added owner-only `PATCH /organizations/:organizationId/status` for
  `ACTIVE <-> SUSPENDED` lifecycle transitions.
* Extended organization admin reads so `GET /organizations`,
  `GET /organizations/current`, and `GET /organizations/:organizationId`
  can surface suspended organizations for safe administrative recovery.
* Preserved identity-first JWT and per-request tenant validation by adding a
  route-scoped suspended-organization allowance only on organization
  read/update/status routes.
* Added structured organization-domain log events for organization update,
  suspension, and reactivation.
* Added unit, OpenAPI, and opt-in E2E coverage for the organization
  administration runtime.

## Compatibility

* No Prisma schema changes.
* No new migrations.
* No frontend changes.
* No infrastructure changes.
* No production access.
* No deployment or backfill activity.

# POST-GO-LIVE.3.0 Closeout

## Status

Closed as a merged documentation-only contract baseline after PR `#35`.

## Highlights

* Certified merge commit `7d897ec8db2c5d372fce0b4dc0eaf3bd3b1d4b13` as the new
  official POST-GO-LIVE.3.0 baseline on `development`.
* Confirmed post-merge `Backend CI / backend` succeeded on workflow run
  `30411839106`, job `90449491216`.
* Recorded POST-GO-LIVE.3.0 as closed at the documentation/contract/architecture
  level only.
* Preserved the merged decisions for active organization selection,
  owner-protection rules, corrected membership endpoint matrix, and schema-gated
  historical membership re-entry.
* Registered POST-GO-LIVE.3.1 Organization Administration Runtime as the next
  phase, still not started and not implemented.

## Compatibility

* No runtime code changes.
* No Prisma schema changes.
* No new migrations.
* No frontend changes.
* No infrastructure changes.
* No production access.
* No deployment or backfill activity.

# POST-GO-LIVE.3.0 Organization & Membership Administration Contract

## Status

Documented for review as a documentation-only organization-domain audit and
contract phase.

## Highlights

* Audited the real backend baseline for `Organization`,
  `OrganizationMembership`, `OrganizationInvitation`, `Auth`, `TenantContext`,
  runtime capabilities, and tenant-aware tooling.
* Recorded that the organization domain is already partially implemented in the
  current backend through organization read routes, membership administration,
  invitation lifecycle routes, and owner-protection invariants.
* Published the normative POST-GO-LIVE.3.0 contract in
  `POST_GO_LIVE_3_0_ORGANIZATION_MEMBERSHIP_ADMINISTRATION_CONTRACT.md`.
* Published the active organization selection ADR in
  `adr/ADR-ORGANIZATION-ACTIVE-SELECTION.md`.
* Corrected source-of-truth documentation that still described the 2.1C2
  organization routes as unimplemented.

## Compatibility

* No runtime code changes.
* No Prisma schema changes.
* No new migrations.
* No frontend changes.
* No infrastructure changes.
* No production access.
* No deployment or backfill activity.

# POST-GO-LIVE.2.1D5 Tenant Platform Certification

## Status

Published for D5-R review; no production rollout, merge, or closure performed.

## Highlights

* Added an opt-in tenant platform certification E2E suite gated by
  `RUN_TENANT_PLATFORM_CERTIFICATION_TESTS=true`.
* Published the D5 readiness report in
  `POST_GO_LIVE_2_1_TENANT_PLATFORM_CERTIFICATION.md`.
* Certified representative final-platform gates for tenant context,
  suspended access, cross-tenant Patient redaction, clinical assignment,
  role boundaries, blob isolation, server-owned financial fields, tenant
  summary filters, legacy-null exclusion, default-deny capabilities, and
  OpenAPI server-owned DTO contracts.
* No Prisma schema changes.
* No new migrations.

## Compatibility

* D5 is certification and documentation only. It does not add endpoints, change
  public response contracts, touch frontend behavior, access production data,
  deploy infrastructure, run backfills, merge the branch, or start
  POST-GO-LIVE.3.

---

# POST-GO-LIVE.2.1D4 Integrated Tenant Certification

## Status

Certified locally and merged before D5.

## Highlights

* Added an opt-in integrated tenant contract E2E suite for D1 through D3
  surfaces.
* Certified the freelancer `OWNER` flow across Patients, Case Files,
  Workspace, Session Notes, Documents/blob access, Appointments with notes,
  Financial Transactions, and Financial Summary.
* Certified multi-role boundaries, cross-tenant isolation, legacy
  `organizationId = NULL` exclusion, clinical assignment, document storage-key
  defenses, appointment-note projection, server-owned `createdById`, and
  tenant-scoped financial summaries in one disposable PostgreSQL database.
* No Prisma schema changes.
* No new migrations.

## Changed

* Added `test/integrated-tenant-contract.e2e-spec.ts` as an explicit opt-in
  certification suite gated by `RUN_INTEGRATED_TENANT_CONTRACT_TESTS=true`.
* Recorded the D4 integrated certification boundary without declaring
  POST-GO-LIVE.2.1D closed.

## Security Notes

* The integrated suite uses synthetic data only and verifies sanitized
  telemetry does not contain appointment notes, clinical content, filenames,
  tokens, passwords, database URLs, SQL, Prisma internals, or upload paths.
* Document blob access remains authorized through tenant-aware metadata before
  filesystem access. Missing blobs and cross-tenant blobs return sanitized
  denials.

## Compatibility

* No business functionality, frontend, production access, deployment,
  backfill, Prisma schema change, migration, global Prisma middleware, RLS, or
  POST-GO-LIVE.2.1D closure action was introduced.

# POST-GO-LIVE.2.1D3 Scheduling and Financial Tenant Conversion

## Status

Certified locally

## Highlights

* Converted Appointments to tenant-aware scheduling.
* Protected `Appointment.notes` as clinical content.
* Converted Financial Transactions to tenant-aware CRUD.
* Converted Financial Summary to tenant-aware aggregates.
* Added explicit `finance.summary_read` capability.
* Added scheduling and financial tenant certification E2E coverage.
* Certified D3 against disposable local PostgreSQL with opt-in E2E coverage.
* No Prisma schema changes.
* No new migrations.

## Changed

* Appointment controllers now require resolved tenant context and pass immutable
  request scope to the service.
* Appointment reads and mutations use `organizationId` as the primary boundary
  and exclude legacy `organizationId = NULL` rows.
* Appointment operational projections omit notes unless clinical capability and
  active same-tenant assignment are both present.
* Receptionist scheduling access is limited to operational fields and cannot
  read or mutate appointment notes.
* Financial transaction reads, writes, deletes, filters, and summaries are
  scoped by selected `organizationId`.
* Financial transaction creation derives `createdById` from the authenticated
  request scope; the client no longer owns that field.
* Financial summary uses `finance.summary_read`; `report.read` is not a
  substitute.

## Security Notes

* Cross-tenant and legacy-null appointment and financial direct resources
  return redacted `404`.
* Cross-tenant mutations perform no side effects.
* Financial aggregates exclude foreign and legacy-null rows.
* Clinical assignment does not grant finance access.

## Compatibility

* No Prisma schema change, migration, seed, frontend change, production data
  access, deployment, global Prisma middleware, RLS, or infrastructure change
  was introduced.

# POST-GO-LIVE.2.1D2 Clinical Core and Documents Tenant Conversion

## Status

Completed

## Highlights

* Converted Clinical Core to tenant-aware architecture.
* Case Files.
* Workspace.
* Session Notes.
* Documents.
* Blob access.
* Shared `ClinicalAccessPolicyService`.
* D2 capability catalog completed.
* PostgreSQL certification completed.
* Full regression passed.
* No Prisma schema changes.
* No new migrations.

## Changed

* Aligned Case Files, Workspace, Session Notes, and Documents/blob access with
  the 2.1D0 tenant-aware policy: resolved tenant context, active membership,
  active organization, explicit domain capability, active clinical assignment,
  and temporary legacy psychologist restriction.
* Converted direct, list, relationship, workspace, metadata, download, update,
  and delete flows to scope by `organizationId` and exclude legacy
  `organizationId = NULL` records.
* Session note and document creation/update ignore server-owned tenant and
  actor fields from request payloads and derive them from the validated
  request context.
* Document blob access now authorizes metadata before filesystem access and
  constrains physical paths to the assigned patient folder; document deletes
  remove metadata first and then run sanitized best-effort blob cleanup.

## Security Notes

* Cross-tenant and legacy-null direct resources return redacted `404`.
* Visible in-tenant clinical resources without active assignment return `403`.
* `OWNER` and `ADMIN` do not bypass clinical assignment.
* `AUDITOR` and `READ_ONLY` receive no clinical core or document projection in
  this phase.

## Compatibility

* No Prisma schema change, migration, seed, frontend change, production data
  access, deployment, Appointments, Financial Transactions, Financial Summary,
  or D3 conversion was introduced.

# POST-GO-LIVE.2.1D1 Patients Tenant Policy Alignment

## Changed

* Aligned the Patients module with the 2.1D0 tenant-aware policy: tenant
  context, explicit `patient.*` capabilities, active same-tenant membership,
  active organization, active assignment, and temporary legacy psychologist
  restriction.
* Patient creation now derives `organizationId` and legacy `psychologistId`
  from the validated request context and creates an active primary assignment
  for the current membership.
* Patient reads, updates and deletes now require active assignment. Lists only
  return assigned tenant patients and continue excluding legacy
  `organizationId = NULL` rows.
* Patient direct misses and cross-tenant resources use a generic redacted
  `404`; visible in-tenant capability or assignment failures use `403`.

## Security Notes

* `OWNER` and `ADMIN` no longer bypass patient assignment for clinical patient
  access.
* `AUDITOR` and `READ_ONLY` receive no patient clinical/personal projection in
  this phase.

## Compatibility

* No Prisma schema change, migration, seed, frontend change, production data
  access, deployment, Case Files, Workspace, Session Notes, Documents,
  Appointments, Financial Transactions, or Financial Summary conversion was
  introduced.

# POST-GO-LIVE.2.1D0 Clinical and Financial Tenant Conversion Contract

## Added

* Documentation-only D0 contract for the 2.1D conversion of Patients, Case
  Files, Workspace, Session Notes, Documents, Appointments, Financial
  Transactions, and Financial Summary.
* Approved single-role membership posture: capabilities and clinical assignment
  express combined responsibilities without accumulated roles.
* Role, capability, module, legacy-null, projection, observability, HTTP, and
  test-gate matrices for D1 through D4.

## Security Notes

* `OWNER` and `ADMIN` do not gain clinical-content access by organizational
  role alone.
* `AUDITOR` and `READ_ONLY` have no clinical-content, session-note, or document
  download access during 2.1D.
* Tenant-aware endpoints must exclude legacy `organizationId = NULL` rows from
  reads, writes, counts, summaries, and relationships.

## Compatibility

* No runtime code, Prisma schema, migration, seed, production data, deployment,
  frontend behavior, D1 implementation, or merge behavior changed.

# POST-GO-LIVE.2.1C2 Organization, Membership & Invitation APIs

## Added

* Tenant-scoped Organization, Membership and Invitation API routes with typed
  default-deny capabilities and sanitized lifecycle observations.
* Serializable membership and invitation mutations that use conditional writes,
  protect the last active OWNER, materialize relevant expired invitations, and
  preserve membership history.

## Compatibility

* No Prisma schema/migration, backfill, production action, frontend change,
  global enforcement, or conversion of legacy clinical modules was added.

---

# POST-GO-LIVE.2.1C1 Invitation Lifecycle Persistence

## Added

* Prisma persistence for normalized invitation recipients, optional invitee and
  accepter identity bindings, recipient rejection, and materialized expiry.
* A PostgreSQL terminal-state check and SQL-managed partial unique index that
  prevents concurrent terminal-free invitations with the same organization and
  normalized email.
* Fail-closed legacy preflight for unsafe normalized invitation keys, plus
  schema/migration certification coverage.

## Compatibility

* No APIs, controllers, services, repositories, guards, DTOs, email delivery,
  backfill, tenant enforcement, production migration, or deployment behavior
  was introduced. Expiry materialization belongs to the expressly deferred API
  transaction flow.

---

# POST-GO-LIVE.2.1C0 Invitation & Membership Mutation Contract

## Added

* An approved, default-deny capability contract for invitation lifecycle and
  membership mutations.
* Contract definitions separating revocation, recipient rejection, expiry,
  administrative removal, and self-leave.
* A recommended schema/migration boundary, recipient-binding model,
  anti-enumeration semantics, concurrency gates, and staged 2.1C1/2.1C2 plan.
* Approved product decisions for ADMIN non-OWNER management, AUDITOR sanitized
  reads, seven-day expiry, persistent rejection/expiry, re-invitation after
  rejection, no MVP ownership transfer, and no production email delivery.

## Compatibility

* No Prisma schema, migration, runtime module, endpoint, DTO, service,
  repository, backfill, frontend, production data, or deployment behavior was
  changed. The current typed capability catalog remains unchanged.

---

# POST-GO-LIVE.2.1B Tenant Context, Capability Resolution & Observability

## Added

* Closed, typed organization-capability catalog and centralized policy resolver
  derived from the approved capability matrix. Conditional capabilities remain
  denied until their specific assignment, redaction, or owner policy exists.
* Sanitized tenant-resolution telemetry for successful resolution, malformed
  selection, redacted denial, ambiguity, missing required context, and
  capability denial.
* Request-context protections that freeze TenantContext, reject a second
  resolution in the same request, and expose typed absent-context errors.
* Unit coverage for strict header parsing, inactive membership states,
  capability default-deny behavior, conditional AUDITOR/READ_ONLY behavior,
  reusable guard ordering, and interleaved AsyncLocalStorage contexts.

## Changed

* Tenant resolution now reads the authenticated user's membership status and
  organization status together, allowing safe reason-code telemetry without
  changing the redacted external `403` response.
* Swagger documents `X-Organization-Id` on the tenant-required Patients pilot.

## Compatibility

* No Prisma schema, migration, seed, backfill, JWT tenant claim, global tenant
  enforcement, or legacy clinical-module conversion was introduced. Patients
  retains its `organizationId + psychologistId` double barrier; capability
  enforcement for clinical modules remains deferred to 2.1D.

---

# POST-GO-LIVE.2.1A Domain, Tenant Context & Authorization Contract

## Added

* Versioned tenant-context and data-isolation ADRs.
* Primary authorization contract, capability matrix, endpoint scope matrix,
  and tenant security test contract.

## Compatibility

* No Prisma schema, migration, runtime guard, service, controller, JWT, API,
  frontend, data, backfill, or deployment behavior changed.

---

# POST-GO-LIVE.1.7A Tenant-Aware Patients Pilot

## Changed

* Patients is the first tenant-aware clinical module. Every Patients endpoint
  requires a resolved TenantContext and scopes access by both `organizationId`
  and authenticated `psychologistId`; legacy global ADMIN access is not used.
* Patient create and update contracts no longer accept ownership fields. A
  nullable `organizationId` is deliberately excluded from the pilot scope.

## Security Notes

* The pilot uses explicit scope parameters; it adds neither a global Prisma
  middleware nor global tenant enforcement. Other clinical modules remain on
  legacy ownership compatibility.
* A future deployment requires separate certification that the target database
  has completed the versioned backfill. No index or migration was added here.

---

# POST-GO-LIVE.1.6 Tenant Context & Runtime Compatibility Foundation

## Added

* Request-isolated tenant context resolution from the authenticated user and
  active PostgreSQL memberships, with safe explicit organization selection.
* `@TenantRequired()` and `@CurrentTenant()` for gradual route adoption, plus
  tenant-optional `GET /auth/context` for safe organization selection.
* Unit, concurrency, and opt-in PostgreSQL integration coverage for tenant
  resolution, cross-tenant rejection, and context isolation.

## Changed

* Existing authenticated routes are tenant-optional; public routes bypass
  resolution. Legacy `User.role`, `psychologistId`, JWT format, and clinical
  ownership queries are unchanged.
* Structured HTTP logs may include only tenant/user/membership identifiers and
  resolution mode; no headers, clinical data, names, emails, or tokens are
  added.

## Security Notes

* `X-Organization-Id` is never trusted until matched to the authenticated
  user's active membership and an active organization.
* Ambiguous memberships are never resolved by order. Required routes return a
  redacted conflict, and optional legacy routes receive no tenant context.

---

# POST-GO-LIVE.1.5 Legacy Organization & Backfill Foundation

## Added

* A manifest-validated `npm run saas:legacy-backfill` operational command with
  dry-run, explicit apply confirmation, structured redacted reports,
  serializable transaction handling and idempotence checks.
* Unit coverage for manifests, safety gates, role mapping, planning,
  no-change second runs and report privacy.
* Opt-in PostgreSQL coverage for the end-to-end legacy backfill path.
* `docs/SAAS_LEGACY_BACKFILL.md` runbook, including rollback guidance.

## Changed

* No runtime NestJS routes, guards, authorization rules, ownership filtering
  or API contracts changed.
* No Prisma schema migration was added. The active-PRIMARY partial index and
  cross-tenant constraints are deliberately deferred.

## Security Notes

* Apply rejects production-like database names, requires a dedicated
  confirmation value and defaults to `_test` databases.
* Reports avoid passwords, URLs with credentials, patient names, clinical
  notes, documents and other PHI.

> Backend change log for the Psychology Management System Backend.

---

# BE.2.6 Dependency Risk Remediation

## Changed

* Updated `@nestjs/platform-express` from `11.1.27` to `11.1.28`, which updates the productive `multer` path used by `FileInterceptor` to `multer@2.2.0`.
* Updated `@nestjs/swagger` from `11.4.4` to `11.4.5`, which replaces its vulnerable `js-yaml@4.1.1` dependency with `js-yaml@4.3.0`.

## Added

* Regression tests for `POST /documents/upload` covering the multipart `file` field, `caseFileId`, missing file rejection, unsupported MIME/extension rejection and the 10 MB upload limit.

## Security Notes

* Closed the productive `multer` denial-of-service advisories reported through `@nestjs/platform-express`.
* Closed the productive `js-yaml` advisory reported through `@nestjs/swagger`.
* Accepted temporary residual risk for the Prisma CLI chain `prisma@7.8.0 -> @prisma/dev@0.24.3 -> @hono/node-server@1.19.11` because npm only proposes a breaking downgrade to `prisma@6.19.3`; no stable Prisma 7 parent update is available.
* Accepted temporary development-only residual risk for `js-yaml@3.14.2` through `@istanbuljs/load-nyc-config`; no compatible parent release is available in that dependency line.
* Docker build still uses Node 20 and completes successfully. The build logs an `EBADENGINE` warning for Prisma's transitive `@prisma/streams-local@0.1.2` package under Node 20; this remains a follow-up compatibility item and did not change the Docker contract.

## Validation

* `npm ci --ignore-scripts` completed from `package-lock.json`; as expected, it does not generate Prisma Client.
* `npx --no-install prisma generate` was required after `npm ci --ignore-scripts` and completed without a database connection.
* `npm run build`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test -- --runInBand`, `npm ls --depth=0` and local `docker build` completed successfully after regeneration.

## Compatibility

* No API routes, DTOs, authentication, authorization, ownership filtering, upload field names, upload metadata, Dockerfile, Compose services, CI workflows, Prisma schema, migrations, seeds, Frontend or Infra files were changed.

---

# Sprint 9.5

## Added

* Jest setup file that provides a safe dummy `DATABASE_URL` for unit tests.

## Changed

* Financial transaction list and summary filters now return empty results for non-owned `patientId` and `appointmentId` values instead of raising visibility-leaking lookup errors.
* Project documentation now explains how to run Prisma generate with `DATABASE_URL` available.

## Notes

* This sprint hardens environment and test behavior without adding new backend features.

---

# Sprint 9.4

## Added

* Query DTO for financial transaction filters.
* Filter support in `GET /financial-transactions`.
* Protected endpoint `GET /financial-transactions/summary` with a basic totals response.

## Changed

* Financial transaction ownership rules remain preserved while applying filters for `ADMIN` and `PSYCHOLOGIST`.
* API documentation now covers financial filters and the new summary endpoint.

## Notes

* The financial summary is calculated from `occurredAt`.
* This sprint does not include advanced dashboards, fiscal invoicing, bank reconciliation, exports or pagination.

---

# Sprint 9.3

## Added

* NestJS module `FinancialTransactionsModule` with controller, service and DTOs.
* Base CRUD endpoints for `FinancialTransaction`.
* Swagger documentation and DTO validation for the financial transactions API.
* Base ownership rules for `ADMIN` and `PSYCHOLOGIST` in the financial service.
* Relational validation for `patientId`, `appointmentId` and admin-provided `createdById`.

## Changed

* `AppModule` now registers the financial transactions module.
* Backend documentation now reflects the financial CRUD base and Sprint 9.3 scope.

## Notes

* This sprint intentionally excludes advanced filters, pagination, dashboards, fiscal invoicing and bank reconciliation.
* Financial ownership still does not duplicate `psychologistId`; it is resolved through related entities and `createdById`.

---

# Sprint 9.2

## Added

* Prisma enums `FinancialTransactionType`, `FinancialTransactionStatus` and `FinancialTransactionCategory`.
* Prisma model `FinancialTransaction` mapped to `financial_transactions`.
* Inverse Prisma relations from `User`, `Patient` and `Appointment` to `FinancialTransaction`.
* Base documentation for the new financial data domain.

## Changed

* `FinancialTransaction.paymentMethod` now uses the `PaymentMethod` enum instead of a free-text string.
* This change reduces inconsistent values and improves future reporting and dashboard readiness.

## Notes

* This sprint only introduces the financial data model layer.
* No financial REST endpoints, NestJS modules, controllers, services or DTOs were added.
* Ownership for financial transactions does not duplicate `psychologistId`; it will be resolved in future work through existing relationships and `createdById`.

---

End of document.
