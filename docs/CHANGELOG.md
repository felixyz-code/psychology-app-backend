# Changelog

> Backend change log for the Psychology Management System Backend.

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
