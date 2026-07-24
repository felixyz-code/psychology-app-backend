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

The Clinical Workspace is an API projection over existing entities, not a persisted database entity.

It is anchored by `CaseFile` and aggregates:

* The case file
* Its patient
* Appointments linked to that patient
* Session notes linked to that case file
* Documents linked to that case file

The workspace timeline is derived at request time from existing timestamps and does not introduce new tables or schema fields.

---

# Enumerations

## UserRole

* `ADMIN`
* `PSYCHOLOGIST`

### Description

Defines authorization level inside the application.

`User.role` remains the legacy runtime authorization role. It is deliberately
separate from `OrganizationMembership.role`, which represents authority inside
one organization and is carried independently in Tenant Context.

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

Basic financial summaries and filtered reports use `occurredAt` as the temporal field for calculations.

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

# Additive SaaS Foundation

The SaaS foundation is additive and does not yet make the application
multi-tenant. It introduces `Organization`, `OrganizationMembership`,
`PsychologistProfile`, organization settings/branding, inactive invitation
storage and `PatientAssignment` persistence without public API flows or tenant
authorization enforcement.

`Patient`, `CaseFile`, `SessionNote`, `Document`, `Appointment` and
`FinancialTransaction` now expose a nullable `organizationId`. Existing
`psychologistId`, global `User.role` and all legacy ownership behaviour remain
the runtime source of truth until a later backfill and enforcement phase.

The additive migration intentionally does not create a Legacy Organization,
infer an OWNER, populate memberships or assignments, move uploads, or make any
legacy column mandatory. Cross-tenant composite constraints, a partial unique
index for active primary assignments, soft-delete, audit events and tenant
filters are deferred until data has been backfilled and validated.

`OrganizationMembership` is unique per organization and user. A
`PsychologistProfile` is one-to-one with a user but grants neither membership
nor clinical access. `PatientAssignment` is stored for future historical
professional assignment; it is not yet populated or used by authorization.

### POST-GO-LIVE.2.1D0 assignment and tenant boundary

`POST_GO_LIVE_2_1D0_TENANT_CONVERSION_CONTRACT.md` makes `organizationId` the
primary tenant isolation boundary for the future D1 through D3 module
conversion. Nullable `organizationId` remains a legacy state and is not visible
through tenant-aware endpoints until a separate certified backfill.

Each `OrganizationMembership` stores one organizational role only. Combined
responsibilities are represented by capabilities plus `PatientAssignment`, not
by accumulating roles. `PatientAssignment` becomes the required clinical
condition for clinical content during 2.1D; it must belong to the same
organization as the patient and membership. `psychologistId` remains only a
temporary additional assignment restriction and must not be used as a tenant
fallback.

### POST-GO-LIVE.1.4 validation

The additive migration was validated against disposable PostgreSQL 16.14
databases both from an empty schema and from a representative legacy schema.
The legacy validation preserved row counts, `User.role`, `Patient.psychologistId`
and null `organizationId` values, while creating no Organization, Membership or
Profile automatically. Prisma migration status and `migrate diff` reported no
drift. This confirms N/N+1 schema compatibility only; it does not activate
tenant enforcement or complete the later backfill phase.

### POST-GO-LIVE.1.5 legacy backfill foundation

The legacy backfill is an explicit operational command documented in
`SAAS_LEGACY_BACKFILL.md`, not a Prisma migration or runtime behavior. It uses
a versioned manifest to create or validate exactly one Legacy Organization and
a manually selected OWNER. It preserves legacy row counts,
`Patient.psychologistId` and global `User.role`.

`Patient` receives its scope directly; clinical child entities derive theirs
from the Patient relationship. Financial transactions derive from Patient,
then Appointment's Patient, with a documented single-legacy fallback for
unlinked operational transactions. The command creates one active PRIMARY
`PatientAssignment` from each Patient's legacy `psychologistId` and matching
membership. It remains idempotent and fails closed on conflicts.

The active-PRIMARY partial unique index and cross-tenant composite foreign
keys remain deferred until organization scopes are enforced and non-nullable
where appropriate. No tenant filtering is active in this phase.

### POST-GO-LIVE.2.1C1 invitation lifecycle persistence

2.1C1 adds persistence only; it does not add invitation, membership, or
organization APIs, delivery, backfill, tenant enforcement, or a production
deployment. `OrganizationInvitation` retains the original `email` and adds
required `normalizedEmail`, optional `invitedUserId`, optional
`acceptedByUserId`, `rejectedAt`, and `expiredAt`. The optional user references
use `SET NULL` for an invitee and `RESTRICT` for an accepted-by identity, so a
historical acceptance cannot be silently erased by a user deletion.

The canonical key is `lower(btrim(email))` under the PostgreSQL database
collation: trim first, then lowercase. It is limited to 255 bytes. The future
API must validate email format and apply this exact canonicalization before
write; the database deliberately has no complex email regex. PostgreSQL's
`lower()` is collation-aware but is not Unicode full case folding, so the API
must not substitute a locale-dependent normalization. Normalized email is
personal data and must not be emitted in logs or public projections.

Invitation state remains derived, not persisted as an enum: `PENDING` has no
terminal timestamp; `ACCEPTED`, `REJECTED`, `REVOKED`, and `EXPIRED` each have
exactly their corresponding terminal timestamp. `expiredAt` materializes a
previously derived expiry only inside a future serializable lifecycle/create
transaction after `expiresAt` has elapsed. It is retained to release the
pending uniqueness key without an invalid `now()` predicate and to preserve
the reason for terminality.

The migration adds a named check that permits at most one of `acceptedAt`,
`rejectedAt`, `revokedAt`, and `expiredAt`, plus a check that an `expiredAt` is
not earlier than `expiresAt`. The SQL-managed partial unique index over
`(organizationId, normalizedEmail)` covers only rows with all terminal
timestamps null. Thus a future create flow must first materialize equivalent
expired rows and then insert; rejection, revocation, acceptance, and
materialized expiry each release the key.

The migration is safe for legacy rows: it derives `normalizedEmail` from the
existing required `email`, then sets it `NOT NULL`. It aborts without exposing
the value if a legacy email is blank, exceeds the canonical column limit, or
would create duplicate terminal-free invitations. It does not invent an
invitee or accepter; historical accepted rows can therefore retain a null
`acceptedByUserId`, while future acceptance must supply it atomically.

| Proposed change | Classification | Rationale |
| --- | --- | --- |
| Invitation status enum | NOT_NEEDED | Timestamp-derived terminal state avoids an enum migration and preserves accepted/rejected/revoked distinction. |
| `rejectedAt` and `expiredAt` | REQUIRED | Recipient rejection and materialized time expiry remain distinct from revocation. |
| `normalizedEmail` | REQUIRED | Recipient binding and pending-duplicate key. |
| `invitedUserId` | REQUIRED | Optional recipient binding approved by the lifecycle contract. |
| `acceptedByUserId` | REQUIRED | Future acceptance durable proof; nullable only for unmappable legacy history. |
| `rejectedByUserId` | REJECTED | The approved contract requires `rejectedAt`, not a persistent rejection actor. |
| `createdByMembershipId` / `revokedByMembershipId` | DEFERRED | Sanitized structured observability suffices for the API phase; persistent audit design needs separate approval. |
| Pending-invitation partial unique index | REQUIRED | Database-level protection for `(organizationId, normalizedEmail)` while every terminal timestamp is null. |
| Terminal timestamp check constraint | REQUIRED | Prevents mutually incompatible accepted/rejected/revoked/expired states. |
| PatientAssignment PRIMARY index | NOT_NEEDED | It is unrelated to invitation or membership lifecycle and remains deferred. |

PostgreSQL partial indexes cannot be represented completely in Prisma schema;
the reviewed 2.1C1 migration contains the SQL and requires local validation and
a rollback rehearsal. It authorizes neither production execution nor backfill.

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
