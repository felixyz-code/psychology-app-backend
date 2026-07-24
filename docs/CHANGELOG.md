# Changelog

---

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
