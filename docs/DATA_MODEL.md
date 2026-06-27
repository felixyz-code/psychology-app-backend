# Data Model

> Database model and entity relationships for the Psychology Management System Backend.

---

# Purpose

This document describes the current database model implemented by the backend.

It explains:

* Business entities
* Database relationships
* Ownership rules
* Clinical constraints
* Design decisions

The Prisma schema remains the implementation source, while this document explains the business model behind it.

---

# Overview

The application is centered around the patient.

Current clinical and operational hierarchy:

```text
User
|- Patient
|  |- Case File
|  |  |- Session Notes
|  |  `- Documents
|  |- Appointments
|  `- Financial Transactions
|- Session Notes
|- Documents
|- Appointments
`- Financial Transactions

Appointment
`- Financial Transactions
```

Clinical information grows from the patient outward.

The financial domain begins as a supporting operational layer and does not replace the clinical hierarchy.

---

# Enumerations

## UserRole

* `ADMIN`
* `PSYCHOLOGIST`

### Description

Defines authorization level inside the application.

---

## AppointmentStatus

* `SCHEDULED`
* `COMPLETED`
* `CANCELLED`
* `NO_SHOW`

### Description

Represents the operational state of an appointment.

---

## FinancialTransactionType

* `INCOME`
* `EXPENSE`
* `ADJUSTMENT`
* `REFUND`

### Description

Defines the business nature of a financial movement.

---

## FinancialTransactionStatus

* `PENDING`
* `COMPLETED`
* `CANCELLED`

### Description

Represents whether a movement is still expected, settled or voided.

---

## FinancialTransactionCategory

* `SESSION`
* `ASSESSMENT`
* `MANUAL`
* `RENT`
* `UTILITIES`
* `SUPPLIES`
* `SOFTWARE`
* `SALARY`
* `OTHER`

### Description

Provides a first-level categorization for future reporting and filtering.

---

## PaymentMethod

* `CASH`
* `CARD`
* `TRANSFER`
* `CHECK`
* `OTHER`

### Description

Standardizes the allowed payment method values for financial transactions.

It avoids free-text variants and makes future reports and dashboards more consistent.

---

# Business Entities

Each entity should follow the same format.

## User

### Purpose

Represents an authenticated system user.

### Database Table

`users`

### Main Fields

* `id`
* `name`
* `email`
* `passwordHash`
* `role`

### Relationships

* One user can own many `Patient` records
* One user can author many `SessionNote` records
* One user can upload many `Document` records
* One user can own many `Appointment` records
* One user can create many `FinancialTransaction` records

### Ownership

Users act as the ownership root for psychologist-scoped resources.

### Business Notes

Current roles are `ADMIN` and `PSYCHOLOGIST`.

---

## Patient

### Purpose

Represents a person receiving psychological care.

### Database Table

`patients`

### Main Fields

* `psychologistId`
* `firstName`
* `lastName`
* `phoneNumber`
* `email`
* `birthDate`

### Relationships

* Belongs to one `User` as psychologist
* Has one `CaseFile`
* Has many `Appointment` records
* May have many `FinancialTransaction` records

### Ownership

Patient ownership is defined by `psychologistId`.

### Business Notes

One psychologist owns many patients.

Patients remain in the system after treatment.

---

## Case File

### Purpose

Represents the patient's clinical record.

### Database Table

`case_files`

### Main Fields

* `patientId`
* `diagnosis`
* `treatmentPlan`

### Relationships

* Belongs to one `Patient`
* Has many `SessionNote` records
* Has many `Document` records

### Ownership

Ownership is inherited through the related patient.

### Business Notes

Each patient has a single case file in the current MVP.

---

## Session Note

### Purpose

Represents one completed therapy session.

### Database Table

`session_notes`

### Main Fields

* `caseFileId`
* `authorId`
* `sessionDate`
* `title`
* `content`

### Relationships

* Belongs to one `CaseFile`
* Belongs to one `User` as author

### Ownership

Ownership is resolved through the related case file and patient.

### Business Notes

Session notes are part of the protected clinical history.

---

## Document

### Purpose

Represents a clinical attachment.

### Database Table

`documents`

### Main Fields

* `caseFileId`
* `uploadedById`
* `fileName`
* `filePath`
* `mimeType`
* `uploadedAt`

### Relationships

* Belongs to one `CaseFile`
* Belongs to one `User` as uploader

### Ownership

Ownership is resolved through the related case file and patient.

### Business Notes

The database stores metadata while the file is stored on disk.

---

## Appointment

### Purpose

Represents scheduled clinical work.

### Database Table

`appointments`

### Main Fields

* `patientId`
* `psychologistId`
* `scheduledAt`
* `durationMinutes`
* `status`
* `notes`

### Relationships

* Belongs to one `Patient`
* Belongs to one `User` as psychologist
* May have many `FinancialTransaction` records

### Ownership

Appointment ownership is defined by `psychologistId`.

### Business Notes

Appointments are operational records that may later connect to other domains.

---

## FinancialTransaction

### Purpose

Represents a financial movement recorded in the system.

### Database Table

`financial_transactions`

### Main Fields

* `type`
* `status`
* `category`
* `amount`
* `currency`
* `concept`
* `description`
* `occurredAt`
* `dueDate`
* `paymentMethod`
* `notes`
* `createdById`

### Relationships

* May optionally belong to one `Patient`
* May optionally belong to one `Appointment`
* Always belongs to one `User` through `createdById`

### Ownership

Ownership is never stored as duplicated data in this entity.

If a transaction is associated with a patient or appointment, ownership must be resolved through those existing relationships.

If a transaction is a general movement not tied to a patient or appointment, `createdById` identifies the user who registered it.

### Business Notes

This model establishes the base financial domain for the backend.

It does not yet include REST endpoints, tax invoicing, payment gateways or bank reconciliation logic.

`paymentMethod` is modeled as an enum instead of free text to avoid inconsistent values and facilitate future reporting and dashboard aggregation.

The backend now exposes a base CRUD module for this entity with ownership resolved through existing relationships and `createdById`.

---

# Entity Relationships

```text
User
|-< Patient
|-< Session Note
|-< Document
|-< Appointment
`-< FinancialTransaction

Patient
|- Case File
|-< Appointment
`-< FinancialTransaction

Case File
|-< Session Note
`-< Document

Appointment
`-< FinancialTransaction
```

---

# Ownership Rules

Ownership is enforced through entity relationships.

ADMIN

* Full access.

PSYCHOLOGIST

* Access only to owned resources.

Ownership is never stored as duplicated data.

It is resolved through existing relationships.

For financial transactions, ownership must not be duplicated through a dedicated `psychologistId` column.

It is resolved through `patientId`, `appointmentId` or `createdById`, depending on the transaction context.

---

# Clinical Rules

Current business rules:

* One patient has exactly one case file.
* One case file belongs to exactly one patient.
* Session Notes always belong to a Case File.
* Documents belong to a Case File.
* Appointments belong to a Patient.
* Patients belong to a Psychologist.
* Financial Transactions may optionally belong to a Patient.
* Financial Transactions may optionally belong to an Appointment.
* Financial Transactions always record the creator through `createdById`.

These rules define the current MVP and the first backend step of the financial domain.

---

# Design Decisions

## Why one Case File per Patient?

To centralize the complete clinical history.

---

## Why Documents belong to Case Files?

Because documents are part of the clinical record.

Future versions may support additional ownership.

---

## Why UUID?

To avoid sequential identifiers and simplify distributed environments.

---

## Why ownership through relationships?

To avoid duplicated ownership columns and maintain consistency.

---

## Why FinancialTransaction does not store psychologistId?

To preserve the existing ownership rule of the project.

Ownership must be inferred through related entities when they exist, and only fall back to `createdById` for general movements.

---

# Future Evolution

Possible future additions:

* Organizations
* Multi-specialist support
* Audit logs
* Clinical templates
* Diagnosis history
* Electronic signatures
* External object storage
* Financial summaries
* Financial filters and reporting

These features should extend the current model rather than replacing it.

---

# References

Related documentation:

* PROJECT.md
* AGENTS.md
* ARCHITECTURE.md
* API.md

End of document.
