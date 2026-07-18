# Changelog

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
