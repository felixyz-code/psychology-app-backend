# Changelog

> Backend change log for the Psychology Management System Backend.

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
