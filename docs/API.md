# API Documentation

> REST API contract for the Psychology Management System Backend

# Purpose

This document defines the public REST API contract exposed by the backend.

> POST-GO-LIVE.3.0 note: organization, membership, and invitation routes are
> implemented in the current backend baseline. Their broader lifecycle,
> ownership, and active-organization evolution is governed by
> `POST_GO_LIVE_3_0_ORGANIZATION_MEMBERSHIP_ADMINISTRATION_CONTRACT.md`.
> This document records the current API surface; it does not claim that every
> future 3.x organization-domain operation is already implemented.

Business rules are documented in PROJECT.md.

Architecture is documented in ARCHITECTURE.md.

Database relationships are documented in DATA_MODEL.md.

# Overview

The API follows REST principles.

Current characteristics:

- JWT Authentication
- UUID identifiers
- Ownership filtering
- JSON requests/responses
- Swagger support


## General Information

* Current base path: `/`
* Swagger UI: `/api/docs`
* Swagger supports `Authorize` using Bearer Token.
* All route IDs are UUIDs.
* Clinical endpoints require JWT Bearer authentication.
* Public endpoints: `POST /auth/login`, `POST /auth/freelancer-bootstrap`

## Authentication

Protected endpoints require:

```http
Authorization: Bearer <accessToken>
```

## Roles

Current roles:

* `ADMIN`
* `PSYCHOLOGIST`

## Ownership Rules

General ownership behavior:

* Tenant-converted clinical modules require resolved tenant context, active
  membership, active organization, explicit capability, active clinical
  assignment, and the temporary legacy psychologist restriction.
* `ADMIN` and `OWNER` do not bypass clinical assignment on tenant-converted
  clinical content.
* Cross-tenant or legacy-null tenant-converted clinical resources return
  redacted `404 Not Found`.
* Visible in-tenant clinical resources without assignment or capability return
  `403 Forbidden`.
* Legacy modules not yet converted keep their documented legacy ownership
  behavior until their approved phase.

---

# Auth

## `POST /auth/login`

Authenticates a user and returns a JWT.

### Authentication

Public endpoint.

### Body

```json
{
  "email": "string",
  "password": "string"
}
```

### Response

```json
{
  "accessToken": "string",
  "user": {
    "id": "uuid",
    "name": "string",
    "email": "string",
    "role": "ADMIN | PSYCHOLOGIST"
  }
}
```

### Errors

* `401 Unauthorized` when email does not exist.
* `401 Unauthorized` when password is invalid.

## `POST /auth/freelancer-bootstrap`

Creates one public freelancer account, one initial active organization, and
one active owner membership in a single bootstrap flow.

### Authentication

Public endpoint.

### Body

```json
{
  "email": "string",
  "password": "string",
  "name": "string",
  "organizationName": "string"
}
```

### Runtime Rules

* The server canonicalizes user identity as
  `email.trim().toLocaleLowerCase('en-US')`.
* The server preserves `email` as presentation data and stores the canonical
  identity in `User.normalizedEmail`.
* The bootstrap runs as one serializable PostgreSQL transaction.
* The transaction creates exactly one `User`, one `Organization` with
  `status = ACTIVE`, and one `OrganizationMembership` with
  `role = OWNER` and `status = ACTIVE`.
* The bootstrap does not create invitations, does not accept or revoke
  invitations automatically, and does not create a `PsychologistProfile`.
* JWT issuance happens only after a successful commit.
* The JWT remains identity-only and does not contain tenant, organization,
  membership, or capability claims.

### Response

```json
{
  "accessToken": "string",
  "user": {
    "id": "uuid",
    "name": "string",
    "email": "string",
    "role": "ADMIN | PSYCHOLOGIST"
  },
  "organization": {
    "id": "uuid",
    "slug": "string",
    "legalName": "string",
    "displayName": "string",
    "status": "ACTIVE",
    "timezone": "string",
    "locale": "string",
    "currency": "string"
  },
  "membership": {
    "id": "uuid",
    "organizationId": "uuid",
    "userId": "uuid",
    "role": "OWNER",
    "status": "ACTIVE",
    "joinedAt": "date-time"
  }
}
```

### Errors

* `400 Bad Request` for invalid payloads.
* `409 Conflict` when registration cannot be completed safely.
* `429 Too Many Requests` when the route-scoped bootstrap throttle denies the
  request.

---

# Root

## `GET /`

Returns the current root response.

### Response

```text
Hello World!
```

---

## `GET /health`

Returns a minimal health payload for infrastructure checks.

### Authentication

Public endpoint.

### Response

```json
{
  "status": "UP",
  "version": "1.0.0"
}
```

---

# Patients

POST-GO-LIVE.2.1D1: Patients is tenant-required and tenant-aware. The server
derives `organizationId`, membership, role and legacy user identity from the
validated JWT plus tenant context. Patient DTOs do not accept `organizationId`
or `psychologistId`.

Patients access requires:

* valid tenant context;
* active membership and active organization;
* explicit `patient.*` capability;
* active same-tenant `PatientAssignment`;
* temporary legacy `psychologistId === authenticated user id` restriction.

Legacy patients with `organizationId = null` are excluded from lists, direct
reads, updates, deletes and relationship traversal. Cross-tenant or otherwise
inaccessible patient IDs return redacted `404`. Visible in-tenant actions
without capability or assignment return `403`.

## `POST /patients`

Creates a patient.

### Authentication

Bearer Token required.

### Body

```json
{
  "firstName": "string",
  "lastName": "string",
  "phoneNumber": "string | optional",
  "email": "string | optional",
  "birthDate": "date | optional"
}
```

### Ownership

* Requires `patient.create`.
* The backend assigns `organizationId` from the resolved tenant context.
* The backend sets the temporary legacy `psychologistId` to the authenticated
  user ID.
* The backend creates an active same-tenant primary `PatientAssignment` for the
  current membership.
* A freelancer with one `OWNER` membership can create and self-assign patients
  through this flow without accumulating roles.

---

## `GET /patients`

Lists patients ordered by `createdAt desc`.

### Authentication

Bearer Token required.

### Ownership

* Requires `patient.read`.
* Returns only patients in the selected tenant that are assigned to the current
  membership and still match the temporary legacy psychologist restriction.

---

## `GET /patients/:id`

Gets a patient by ID.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Ownership

* Requires `patient.read`.
* Requires active same-tenant assignment and the temporary legacy psychologist
  restriction.

---

## `PATCH /patients/:id`

Updates editable patient fields.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Body

```json
{
  "psychologistId": "uuid | optional",
  "firstName": "string | optional",
  "lastName": "string | optional",
  "phoneNumber": "string | optional",
  "email": "string | optional",
  "birthDate": "date | optional"
}
```

### Ownership

* Requires `patient.update`.
* Requires active same-tenant assignment and the temporary legacy psychologist
  restriction.
* Ownership fields in the request body are ignored.

---

## `DELETE /patients/:id`

Deletes a patient.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Ownership

* Requires `patient.delete`.
* Requires active same-tenant assignment and the temporary legacy psychologist
  restriction.
* Current backend behavior remains physical deletion; same-tenant patient
  assignments are removed before deleting the patient record to preserve
  referential integrity.

---

# Case Files

POST-GO-LIVE.2.1D2: Case Files and Workspace are tenant-required and
tenant-aware. Access requires valid tenant context, active membership, active
organization, explicit `case_file.*` or `workspace.read` capability, active
same-tenant `PatientAssignment`, and the temporary legacy psychologist
restriction. Legacy case files with `organizationId = null` are excluded from
lists, direct reads, relationship reads, updates and workspace projections.

## `POST /case-files`

Creates a unique case file for a patient.

### Authentication

Bearer Token required.

### Body

```json
{
  "patientId": "uuid",
  "diagnosis": "string | optional",
  "treatmentPlan": "string | optional"
}
```

### Behavior

* Requires `case_file.create`.
* Validates that the patient exists in the selected tenant and is assigned to
  the current membership.
* The backend assigns `organizationId` from the resolved tenant context.
* Rejects creating a second same-tenant case file for the same patient.

---

## `GET /case-files`

Lists case files ordered by `createdAt desc`.

### Authentication

Bearer Token required.

### Ownership

* Requires `case_file.read`.
* Returns only case files in the selected tenant for actively assigned patients.

---

## `GET /case-files/patient/:patientId`

Gets the case file by patient ID.

### Authentication

Bearer Token required.

### Params

* `patientId: uuid`

### Ownership

* Requires `case_file.read`.
* Requires active same-tenant assignment to the requested patient.

---

## `GET /case-files/:id`

Gets a case file by ID.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Ownership

* Requires `case_file.read`.
* Requires active same-tenant assignment to the case file patient.

---

## `GET /case-files/:id/workspace`

Gets an aggregated clinical workspace for a case file.

This endpoint reduces frontend composition across case files, patients, appointments, session notes and documents.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Ownership

* Requires `workspace.read`.
* Requires active same-tenant assignment to the case file patient.
* Included appointments, session notes and documents are constrained by
  `organizationId`.
* Cross-tenant or legacy-null workspaces return `404 Not Found`.

### Response

```json
{
  "caseFile": {
    "id": "uuid",
    "patientId": "uuid",
    "diagnosis": "string | null",
    "treatmentPlan": "string | null",
    "createdAt": "date-time",
    "updatedAt": "date-time"
  },
  "patient": {
    "id": "uuid",
    "firstName": "string",
    "lastName": "string",
    "email": "string | null",
    "phoneNumber": "string | null",
    "birthDate": "date | null",
    "createdAt": "date-time",
    "updatedAt": "date-time"
  },
  "summary": {
    "appointmentsCount": 0,
    "sessionNotesCount": 0,
    "documentsCount": 0,
    "lastActivityAt": "date-time | null",
    "nextAppointmentAt": "date-time | null",
    "lastAppointmentAt": "date-time | null"
  },
  "appointments": [
    {
      "id": "uuid",
      "patientId": "uuid",
      "psychologistId": "uuid",
      "scheduledAt": "date-time",
      "durationMinutes": 50,
      "status": "SCHEDULED | COMPLETED | CANCELLED | NO_SHOW",
      "notes": "string | null",
      "createdAt": "date-time",
      "updatedAt": "date-time"
    }
  ],
  "sessionNotes": [
    {
      "id": "uuid",
      "caseFileId": "uuid",
      "authorId": "uuid",
      "sessionDate": "date-time",
      "title": "string | null",
      "content": "string",
      "createdAt": "date-time",
      "updatedAt": "date-time"
    }
  ],
  "documents": [
    {
      "id": "uuid",
      "caseFileId": "uuid",
      "uploadedById": "uuid",
      "fileName": "string",
      "filePath": "string",
      "mimeType": "string | null",
      "uploadedAt": "date-time",
      "updatedAt": "date-time"
    }
  ],
  "timeline": [
    {
      "id": "string",
      "type": "CASE_FILE_CREATED | APPOINTMENT_COMPLETED | SESSION_NOTE_CREATED | DOCUMENT_UPLOADED",
      "title": "string",
      "description": "string | null",
      "occurredAt": "date-time",
      "sourceId": "uuid",
      "sourceType": "CASE_FILE | APPOINTMENT | SESSION_NOTE | DOCUMENT"
    }
  ]
}
```

### Summary Rules

* `appointmentsCount` counts all appointments linked to the patient that owns the case file.
* `sessionNotesCount` counts session notes linked to the case file.
* `documentsCount` counts documents linked to the case file.
* `lastActivityAt` is the most recent `occurredAt` from the generated timeline.
* `nextAppointmentAt` is the next future appointment with status `SCHEDULED`.
* `lastAppointmentAt` is the latest past appointment with status `COMPLETED`.

### Timeline Rules

Timeline events use only real persisted records:

* `CASE_FILE_CREATED`: `occurredAt = caseFile.createdAt`.
* `SESSION_NOTE_CREATED`: `occurredAt = sessionNote.sessionDate`, because it represents the clinical session date. `createdAt` remains the record audit timestamp.
* `DOCUMENT_UPLOADED`: `occurredAt = document.uploadedAt`.
* `APPOINTMENT_COMPLETED`: only appointments with status `COMPLETED`; `occurredAt = appointment.scheduledAt`.

The timeline is ordered by `occurredAt desc`.

### Current Limitations

* Appointments are linked to patients, not directly to case files, so workspace appointments are resolved through the case file patient.
* No synthetic events are generated for updates, cancellations, diagnosis changes, treatment plan changes or deleted resources.

---

## `PATCH /case-files/:id`

Updates a case file.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Body

```json
{
  "diagnosis": "string | optional",
  "treatmentPlan": "string | optional"
}
```

### Ownership

* Requires `case_file.update`.
* Requires active same-tenant assignment to the case file patient.

---

# Session Notes

POST-GO-LIVE.2.1D2: Session Notes are tenant-required and tenant-aware. Access
requires valid tenant context, active membership, active organization, explicit
`session_note.*` capability, active same-tenant `PatientAssignment`, and the
temporary legacy psychologist restriction. Legacy notes with
`organizationId = null` are excluded. The backend derives `organizationId` and
`authorId`; request-provided server fields are ignored.

## `POST /session-notes`

Creates a session note.

### Authentication

Bearer Token required.

### Body

```json
{
  "caseFileId": "uuid",
  "authorId": "uuid",
  "title": "string | optional",
  "content": "string",
  "sessionDate": "date-time"
}
```

### Ownership

* Requires `session_note.create`.
* Requires active same-tenant assignment to the case file patient.
* `authorId` is always replaced with the authenticated user ID.

---

## `GET /session-notes`

Lists session notes ordered by `sessionDate desc`.

### Authentication

Bearer Token required.

### Ownership

* Requires `session_note.read`.
* Returns only notes for assigned case files in the selected tenant.

---

## `GET /session-notes/case-file/:caseFileId`

Lists notes for a case file ordered by `sessionDate desc`.

### Authentication

Bearer Token required.

### Params

* `caseFileId: uuid`

### Ownership

* Requires `session_note.read`.
* Requires active same-tenant assignment to the case file patient.

---

## `GET /session-notes/:id`

Gets a session note by ID.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Ownership

* Requires `session_note.read`.
* Requires active same-tenant assignment to the note's case file patient.

---

## `PATCH /session-notes/:id`

Updates a session note.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Body

```json
{
  "title": "string | optional",
  "content": "string | optional",
  "sessionDate": "date-time | optional"
}
```

### Ownership

* Requires `session_note.update`.
* Requires active same-tenant assignment to the note's case file patient.

---

## `DELETE /session-notes/:id`

Deletes a session note.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Ownership

* Requires `session_note.delete`.
* Requires active same-tenant assignment to the note's case file patient.

---

# Documents

The `documents` module supports metadata management, physical file upload, secure download and inline preview.

POST-GO-LIVE.2.1D2: Documents are tenant-required and tenant-aware. Access
requires valid tenant context, active membership, active organization, explicit
document capability, active same-tenant `PatientAssignment`, and the temporary
legacy psychologist restriction. Legacy documents with `organizationId = null`
are excluded. Blob routes authorize metadata before filesystem access.

## Allowed File Types

MIME types:

* `application/pdf`
* `image/jpeg`
* `image/png`

Extensions:

* `.pdf`
* `.jpg`
* `.jpeg`
* `.png`

Maximum size:

* `10 MB`

---

## `POST /documents/upload`

Uploads a file and creates its metadata.

### Authentication

Bearer Token required.

### Content-Type

```http
multipart/form-data
```

### Form Data

* `file`
* `caseFileId: uuid`

### Behavior

* Stores the file on disk.
* Creates a `Document` record.
* Preserves `fileName` with the original filename.
* Stores `filePath` as a relative path.
* Uses the structure `patients/{patientId}/{uuid}.{ext}`.
* Sets `organizationId` and `uploadedById` from the validated request context.
* Legacy clients may still send `uploadedById`, but the backend ignores it.

### Ownership

* Requires `document.upload`.
* Requires active same-tenant assignment to the case file patient.

---

## `POST /documents`

Creates document metadata without uploading a physical file.

### Authentication

Bearer Token required.

### Body

```json
{
  "caseFileId": "uuid",
  "uploadedById": "uuid",
  "fileName": "string",
  "filePath": "string",
  "mimeType": "string | optional"
}
```

### Ownership

* Requires `document.upload`.
* Requires active same-tenant assignment to the case file patient.
* `uploadedById` is always replaced with the authenticated user ID.

### Note

This endpoint should be reviewed in future versions to decide whether metadata-only document creation should remain supported.

---

## `GET /documents`

Lists documents ordered by `uploadedAt desc`.

### Authentication

Bearer Token required.

### Ownership

* Requires `document.metadata_read`.
* Returns only documents for assigned case files in the selected tenant.

---

## `GET /documents/case-file/:caseFileId`

Lists documents for a case file.

### Authentication

Bearer Token required.

### Params

* `caseFileId: uuid`

### Ownership

* Requires `document.metadata_read`.
* Requires active same-tenant assignment to the case file patient.

---

## `GET /documents/:id`

Gets document metadata by ID.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Ownership

* Requires `document.metadata_read`.
* Requires active same-tenant assignment to the document's case file patient.

---

## `GET /documents/:id/download`

Downloads the physical file associated with the document.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Behavior

* Finds document metadata by ID.
* Requires `document.download` and validates tenant assignment before accessing
  the filesystem.
* Validates that the physical file exists.
* Resolves the file path from `UPLOADS_PATH` or `uploads`.
* Confines the path to `patients/{patientId}/...` under the upload root.
* Responds with `Content-Disposition: attachment`.
* Uses the original `fileName` as download filename.
* Uses `mimeType` as `Content-Type`.
* Blocks path traversal.

---

## `GET /documents/:id/view`

Returns the physical file for inline preview.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Behavior

* Finds document metadata by ID.
* Requires `document.download` and validates tenant assignment before accessing
  the filesystem.
* Validates that the physical file exists.
* Resolves the file path from `UPLOADS_PATH` or `uploads`.
* Confines the path to `patients/{patientId}/...` under the upload root.
* Responds with `Content-Disposition: inline`.
* Uses `mimeType` as `Content-Type`.
* Blocks path traversal.

### Inline Supported Types

* PDF
* JPG
* JPEG
* PNG

---

## `PATCH /documents/:id`

Updates document metadata.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Body

```json
{
  "fileName": "string | optional",
  "filePath": "string | optional",
  "mimeType": "string | optional"
}
```

### Ownership

* Requires `document.update`.
* Requires active same-tenant assignment to the document's case file patient.

---

## `DELETE /documents/:id`

Deletes the document record.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Behavior

* Deletes the database record first.
* Attempts sanitized best-effort physical cleanup after metadata deletion.

### Ownership

* Requires `document.delete`.
* Requires active same-tenant assignment to the document's case file patient.

---

# Appointments

POST-GO-LIVE.2.1D3: Appointments are tenant-required and tenant-aware. The
server derives `organizationId` from the resolved tenant context and legacy
`organizationId = NULL` appointments are invisible to lists, details, and
mutations. Scheduling fields are operational data; `notes` is clinical content.
`RECEPTIONIST` can read and manage operational appointment fields but cannot
read or mutate notes. `OWNER` and `ADMIN` do not receive notes by role alone;
notes require clinical capability plus an active same-tenant assignment.

## `POST /appointments`

Creates an appointment.

### Authentication

Bearer Token required.

### Body

```json
{
  "patientId": "uuid",
  "psychologistId": "uuid",
  "scheduledAt": "date-time",
  "durationMinutes": "number",
  "status": "SCHEDULED | COMPLETED | CANCELLED | NO_SHOW | optional",
  "notes": "string | optional"
}
```

### Ownership

* Requires `appointment.manage`.
* The related patient must belong to the selected organization.
* The target professional must have an active membership in the selected
  organization.
* `PSYCHOLOGIST` can only create appointments for themself.
* `RECEPTIONIST` can create operational appointments only when `notes` is not
  provided.
* `notes` requires clinical capability plus active same-tenant assignment.
* Request payload `organizationId` is ignored if present; tenant scope is
  server-derived.

---

## `GET /appointments`

Lists appointments ordered by `scheduledAt desc`.

### Authentication

Bearer Token required.

### Ownership

* Requires `appointment.read`.
* Results always include `organizationId = selected tenant`.
* `PSYCHOLOGIST` sees appointments where they are the scheduled professional
  or where the patient is assigned to their membership.
* `RECEPTIONIST`, `ADMIN`, and `OWNER` receive operational tenant appointments.
* `notes` is omitted unless the actor also has clinical capability and active
  same-tenant assignment to the patient.

---

## `GET /appointments/patient/:patientId`

Lists appointments for a patient.

### Authentication

Bearer Token required.

### Params

* `patientId: uuid`

### Ownership

* Requires `appointment.read`.
* The patient must belong to the selected organization.
* `PSYCHOLOGIST` must have active same-tenant assignment for the patient route.
* `notes` follows the clinical capability plus assignment rule.

---

## `GET /appointments/:id`

Gets an appointment by ID.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Ownership

* Requires `appointment.read`.
* The appointment must belong to the selected organization.
* Cross-tenant and legacy-null appointment IDs return `404`.
* `notes` follows the clinical capability plus assignment rule.

---

## `PATCH /appointments/:id`

Updates an appointment.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Body

```json
{
  "patientId": "uuid | optional",
  "psychologistId": "uuid | optional",
  "scheduledAt": "date-time | optional",
  "durationMinutes": "number | optional",
  "status": "SCHEDULED | COMPLETED | CANCELLED | NO_SHOW | optional",
  "notes": "string | optional"
}
```

### Ownership

* Requires `appointment.manage`.
* The appointment must belong to the selected organization.
* Any changed patient or professional must belong to the selected organization.
* `PSYCHOLOGIST` cannot assign the appointment to another professional.
* `RECEPTIONIST` can update operational fields only and receives `403` for
  `notes`.
* `notes` requires clinical capability plus active same-tenant assignment.
* Request payload `organizationId` is ignored if present; tenant scope is
  server-derived.

---

## `DELETE /appointments/:id`

Deletes an appointment.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Ownership

* Requires `appointment.manage`.
* The appointment must belong to the selected organization.
* Cross-tenant and legacy-null appointment IDs return `404`.

---

# Financial Transactions

POST-GO-LIVE.2.1D3: Financial Transactions and Financial Summary are
tenant-required and tenant-aware. Financial access uses financial capabilities
and `organizationId` predicates, not clinical assignment. The server derives
`organizationId` and `createdById` from the validated request scope. Legacy
`organizationId = NULL` transactions are invisible to lists, direct access,
mutations, and summaries.

## `POST /financial-transactions`

Creates a financial transaction.

### Authentication

Bearer Token required.

### Body

```json
{
  "type": "INCOME | EXPENSE | ADJUSTMENT | REFUND",
  "status": "PENDING | COMPLETED | CANCELLED | optional",
  "category": "SESSION | ASSESSMENT | MANUAL | RENT | UTILITIES | SUPPLIES | SOFTWARE | SALARY | OTHER | optional",
  "amount": "number",
  "currency": "string | optional",
  "concept": "string",
  "description": "string | optional",
  "occurredAt": "date-time",
  "dueDate": "date-time | optional",
  "paymentMethod": "CASH | CARD | TRANSFER | CHECK | OTHER | optional",
  "notes": "string | optional",
  "patientId": "uuid | optional",
  "appointmentId": "uuid | optional"
}
```

### Behavior

* `amount` must be positive.
* `type`, `amount`, `concept` and `occurredAt` are required.
* Prisma applies defaults for `status`, `category` and `currency`.
* If `patientId` is provided, the patient must exist in the selected
  organization.
* If `appointmentId` is provided, the appointment must exist in the selected
  organization.
* If both are provided, the appointment must belong to the same patient.
* `createdById` is always derived from the authenticated user in the tenant
  scope; client-provided values are not part of the public contract.

### Ownership

* Requires `finance.manage`.
* `OWNER`, `ADMIN`, and `BILLING` can create transactions inside the selected
  organization.
* Clinical assignment does not grant finance access.
* Request payload `organizationId` is ignored if present; tenant scope is
  server-derived.

### Errors

* `400 Bad Request` for invalid payloads or mismatched `patientId` / `appointmentId`.
* `404 Not Found` when a related patient, appointment, or transaction does not
  exist inside the selected tenant.

---

## `GET /financial-transactions`

Lists financial transactions ordered by `occurredAt desc`.

### Authentication

Bearer Token required.

### Ownership

* Requires `finance.read`.
* Results always include `organizationId = selected tenant`.
* `OWNER`, `ADMIN`, and `BILLING` can read tenant transactions.
* Clinical assignment does not grant finance access.

### Query Params

* `from: date-time | date | optional`
* `to: date-time | date | optional`
* `type: INCOME | EXPENSE | ADJUSTMENT | REFUND | optional`
* `status: PENDING | COMPLETED | CANCELLED | optional`
* `category: SESSION | ASSESSMENT | MANUAL | RENT | UTILITIES | SUPPLIES | SOFTWARE | SALARY | OTHER | optional`
* `paymentMethod: CASH | CARD | TRANSFER | CHECK | OTHER | optional`
* `patientId: uuid | optional`
* `appointmentId: uuid | optional`
* `createdById: uuid | optional`

### Filter Rules

* Date filters apply to `occurredAt`.
* `from` maps to `gte`.
* `to` maps to `lte`.
* Every filter is combined with the immutable selected-tenant predicate.
* Foreign `patientId`, `appointmentId`, and `createdById` filters return an
  empty list rather than broadening scope.

### Notes

* This module now supports basic filtering.
* Pagination, tax invoicing, bank reconciliation and advanced dashboards remain
  out of scope.

---

## `GET /financial-transactions/summary`

Returns a basic financial summary calculated from filtered transactions.

### Authentication

Bearer Token required.

### Query Params

* `from: date-time | date | optional`
* `to: date-time | date | optional`
* `type: INCOME | EXPENSE | ADJUSTMENT | REFUND | optional`
* `status: PENDING | COMPLETED | CANCELLED | optional`
* `category: SESSION | ASSESSMENT | MANUAL | RENT | UTILITIES | SUPPLIES | SOFTWARE | SALARY | OTHER | optional`
* `paymentMethod: CASH | CARD | TRANSFER | CHECK | OTHER | optional`
* `patientId: uuid | optional`
* `appointmentId: uuid | optional`
* `createdById: uuid | optional`

### Ownership

* Requires `finance.summary_read`.
* Uses the same tenant predicate and filter rules as
  `GET /financial-transactions`.
* `report.read` is not a substitute for `finance.summary_read`.

### Response

```json
{
  "incomeTotal": 2500,
  "expenseTotal": 450,
  "adjustmentTotal": 100,
  "refundTotal": 200,
  "netTotal": 1950,
  "transactionCount": 8
}
```

### Notes

* The summary is calculated using `occurredAt`, not `createdAt`.
* It includes every visible status unless `status` is explicitly filtered.
* This is not tax invoicing, bank reconciliation or an advanced financial dashboard.
* Foreign `patientId`, `appointmentId`, and legacy-null rows do not contribute
  to counts, sums, or balances.

---

## `GET /financial-transactions/:id`

Gets a financial transaction by ID.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Ownership

* Requires `finance.read`.
* The transaction must belong to the selected organization.
* Cross-tenant and legacy-null transaction IDs return `404`.

---

## `PATCH /financial-transactions/:id`

Updates a financial transaction.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Body

```json
{
  "type": "INCOME | EXPENSE | ADJUSTMENT | REFUND | optional",
  "status": "PENDING | COMPLETED | CANCELLED | optional",
  "category": "SESSION | ASSESSMENT | MANUAL | RENT | UTILITIES | SUPPLIES | SOFTWARE | SALARY | OTHER | optional",
  "amount": "number | optional",
  "currency": "string | optional",
  "concept": "string | optional",
  "description": "string | optional",
  "occurredAt": "date-time | optional",
  "dueDate": "date-time | optional",
  "paymentMethod": "CASH | CARD | TRANSFER | CHECK | OTHER | optional",
  "notes": "string | optional",
  "patientId": "uuid | optional",
  "appointmentId": "uuid | optional"
}
```

### Behavior

* Relational validations from creation also apply on update.
* `createdById` and `organizationId` are server-owned and cannot be changed
  through the request payload.
* Reassignments remain conservative and must stay within tenant relations.

### Ownership

* Requires `finance.manage`.
* The transaction must belong to the selected organization.
* Any changed patient or appointment must belong to the selected organization.
* Cross-tenant and legacy-null transaction IDs return `404`.

### Errors

* `400 Bad Request` for invalid payloads or mismatched `patientId` / `appointmentId`.
* `404 Not Found` when the transaction or a related resource is not found or not accessible.

---

## `DELETE /financial-transactions/:id`

Deletes a financial transaction.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Behavior

* Uses physical delete for consistency with the current backend pattern.

### Ownership

* Requires `finance.manage`.
* The transaction must belong to the selected organization.
* Cross-tenant and legacy-null transaction IDs return `404`.

### Notes

* This module does not include tax invoicing or bank reconciliation logic.

---

# Pending API Improvements

The following items should be reviewed in future backend sprints:

* Define standard error response format.
* Add pagination contract for list endpoints.
* Add search/filter query parameters.
* Decide whether `POST /documents` should remain available.
* Decide whether document physical cleanup should remain best-effort or move to
  an explicit storage lifecycle/audit workflow.
* Decide whether `GET /` should remain a legacy greeting or be replaced by the health/status payload in a future release.

## Tenant Context Selection

Authenticated clients may send one `X-Organization-Id` header containing a UUID
to select an organization for that request. It is a selection hint only: the
server checks the authenticated user's `ACTIVE` membership and the
organization's `ACTIVE` state in PostgreSQL. Empty, malformed, or repeated
values return `400`; inaccessible, missing, inactive, or revoked selections
return the same `403` response without revealing whether another organization
exists.

If no header is sent, a user with one eligible membership is resolved
automatically. A user with several eligible memberships must make an explicit
selection. Patients, Case Files, Workspace, Session Notes, Documents,
Appointments, Financial Transactions, and Financial Summary now require a
resolved context. Clinical modules continue to apply the temporary legacy
psychologist ownership condition where documented.

## POST-GO-LIVE.2.1D0 clinical and financial conversion contract

`POST_GO_LIVE_2_1D0_TENANT_CONVERSION_CONTRACT.md` defines the conversion
contract for Patients, Case Files, Workspace, Session Notes, Documents,
Appointments, Financial Transactions, and Financial Summary during 2.1D.
Patients were converted in D1. Case Files, Workspace, Session Notes, and
Documents were converted in D2. Appointments, Financial Transactions, and
Financial Summary were converted in D3.

POST-GO-LIVE.2.1D4 locally certifies those converted endpoint contracts
together through an integrated opt-in PostgreSQL E2E suite. D4 does not add
routes, DTO fields, response fields, Prisma schema changes, migrations,
frontend behavior, deployment steps, or production data actions.

POST-GO-LIVE.2.1D5 publishes the tenant platform certification suite and
readiness report for the converted clinical and financial endpoint contracts.
D5 adds no routes, DTO fields, response fields, Prisma schema changes,
migrations, frontend behavior, deployment steps, production data actions, or
POST-GO-LIVE.3 work. POST-GO-LIVE.2.1D closure remains pending D5-R review,
controlled merge, post-merge verification, and an explicit closure decision.

For D1 through D3, converted DTOs must not accept `organizationId`; the server
derives tenant scope from the validated request context. Clinical content will
require explicit module capability plus assignment, so `OWNER` and `ADMIN` do
not read unassigned clinical files by role alone. Financial endpoints will use
financial capabilities and tenant predicates, not clinical assignment by
itself. Legacy rows with `organizationId = NULL` remain outside tenant-aware
lists, details, mutations, and summaries until a separate certified backfill.

`X-Organization-Id` is optional on the Patients pilot only because a caller
with exactly one eligible membership is resolved automatically. It is a
selection hint, never authorization evidence, and its UUID value is never
accepted through a DTO, body, query, or path parameter.

### `GET /auth/context`

Bearer Token required; tenant context optional.

Returns `RESOLVED` plus the validated request context when resolution succeeds.
For a multi-membership or otherwise unresolved request it returns `UNRESOLVED`
and only the caller's selectable active memberships (`organizationId`,
`membershipId`, organization display name and organization role), allowing the
frontend to choose `X-Organization-Id` without a bootstrap cycle. A user with
no memberships receives `LEGACY_COMPATIBILITY` and an empty list. It does not
return organizations belonging to other users, clinical records, tokens, or
persisted selection preferences.

# References

PROJECT.md

ARCHITECTURE.md

DATA_MODEL.md

DOCKER.md

---

## POST-GO-LIVE.2.1C2 Organization APIs

Authenticated organization routes are tenant-required except `GET /organizations`,
which lists the caller's active memberships and administrative organization
metadata, and recipient invitation accept/reject routes, which bind to the
authenticated recipient instead of a tenant selection. `X-Organization-Id`
remains a validated selector only. POST-GO-LIVE.3.1 adds dedicated
organization identity and lifecycle administration on top of the pre-existing
read, membership, and invitation surfaces. POST-GO-LIVE.3.2 hardens the
membership runtime and historical lifecycle without adding direct
`POST /memberships`.

| Method | Route | Capability / policy |
| --- | --- | --- |
| GET | `/organizations` | caller active memberships; list may include `ACTIVE` and `SUSPENDED` organizations for administrative discoverability |
| GET | `/organizations/current` | `organization.read`; route allows `ACTIVE` or `SUSPENDED` selected organization state |
| GET | `/organizations/:organizationId` | `organization.read`; path must match selected tenant and route allows `ACTIVE` or `SUSPENDED` organization state |
| PATCH | `/organizations/:organizationId` | `organization.manage` (OWNER); editable identity fields only |
| PATCH | `/organizations/:organizationId/status` | `organization.manage` (OWNER); `ACTIVE <-> SUSPENDED` only |
| POST | `/organizations/:organizationId/ownership-transfer` | `ownership.transfer` (OWNER); dedicated owner handoff only |
| GET | `/organizations/:organizationId/memberships` | `membership.read`; sanitized metadata |
| PATCH | `/organizations/:organizationId/memberships/:membershipId/role` | owner/admin conditional; never OWNER grant |
| PATCH | `/organizations/:organizationId/memberships/:membershipId/status` | owner/admin conditional |
| DELETE | `/organizations/:organizationId/memberships/:membershipId` | owner/admin conditional |
| POST | `/organizations/:organizationId/memberships/leave` | self only; last active OWNER denied |
| GET/POST | `/organizations/:organizationId/invitations` | `invitation.read` / `invitation.create` |
| POST | `/organizations/:organizationId/invitations/:invitationId/revoke` | `invitation.revoke` (OWNER) |
| POST | `/organizations/:organizationId/invitations/:invitationId/resend` | `invitation.resend` (OWNER) |
| POST | `/organization-invitations/:token/accept` | authenticated bound recipient |
| POST | `/organization-invitations/:token/reject` | authenticated bound recipient |

Invitation tokens are SHA-256 digested before persistence and are returned only
once from creation or resend outside production. API responses and logs never
expose a digest; invitation list responses expose sanitized invitation metadata
including recipient email, role, timestamps, and derived `logicalStatus`, but
never the token or `tokenDigest`.

POST-GO-LIVE.3.4 ownership-transfer runtime rules:

- `POST /organizations/:organizationId/ownership-transfer` requires JWT,
  resolved tenant context, `X-Organization-Id`, and the dedicated
  `ownership.transfer` capability; `organization.manage` is not reused.
- The actor must still be the current `ACTIVE` `OWNER` membership for the
  selected organization when the serializable transaction executes; a stale
  actor that is no longer owner fails with conflict rather than silently
  downgrading someone else.
- The target must be another `ACTIVE` membership in the same selected
  organization and must not already be `OWNER`.
- The transfer runs as one serializable PostgreSQL transaction using
  compare-and-set `updateMany()` mutations: target promotion to `OWNER`, actor
  demotion to `ADMIN`, and a final active-owner invariant verification.
- Suspended organizations remain fail-closed for the operation itself even
  though the route opts into suspended-state tenant resolution to return a
  deterministic `409` instead of a generic capability denial.
- The response returns the same organization ID, the demoted source
  membership, the promoted target membership, and a `transferredAt` timestamp.
- Post-commit structured observability emits
  `organization_ownership_transferred` with actor/source/target role metadata
  only after the transaction commits successfully.

POST-GO-LIVE.3.3 invitation administration runtime rules:

- `GET /organizations/:organizationId/invitations` returns administrative
  metadata only, ordered by `createdAt DESC, id DESC`, with
  `logicalStatus = PENDING | ACCEPTED | REJECTED | REVOKED | EXPIRED` derived
  from terminal timestamps and `expiresAt`.
- `POST /organizations/:organizationId/invitations` rejects `OWNER`, reuses the
  canonical invitation email normalization (`trim().toLocaleLowerCase('en-US')`)
  across create/lookup/accept/reject/resend, materializes logically expired
  duplicates before insert, and blocks known recipients that already have an
  `INVITED`, `ACTIVE`, or `SUSPENDED` membership in that organization.
- `POST /organizations/:organizationId/invitations/:invitationId/revoke`
  performs administrative cancelation as `PENDING -> REVOKED` only; a logically
  expired target materializes `EXPIRED` and returns conflict instead of
  revoking.
- `POST /organizations/:organizationId/invitations/:invitationId/resend`
  performs replacement semantics: it revokes a pending invitation or
  materializes an expired one, creates a new row with a new token digest and a
  fresh seven-day TTL, and leaves the previous row in history.
- `POST /organization-invitations/:token/accept` and
  `POST /organization-invitations/:token/reject` both require JWT, skip tenant
  selection, validate canonicalized recipient identity, and execute in
  serializable transactions with conditional updates so concurrent terminal
  replays fail safely.
- Invitation resend invalidates the old token immediately because the original
  row becomes terminal (`REVOKED` or `EXPIRED`) before the replacement row is
  committed.

POST-GO-LIVE.3.2 membership runtime rules:

- `OrganizationMembership` historical re-entry now uses one new row per
  re-entry period. A `REVOKED` row is never reactivated in place.
- PostgreSQL now enforces at most one non-terminal membership
  (`INVITED`, `ACTIVE`, `SUSPENDED`) per `organizationId + userId` through a
  partial unique index; any number of `REVOKED` historical rows are allowed.
- `GET /organizations/:organizationId/memberships` keeps the current
  administrative behavior and lists only non-terminal rows. Historical
  `REVOKED` rows remain preserved in the database but are not projected by the
  current API.
- `PATCH /organizations/:organizationId/memberships/:membershipId/role` never
  grants `OWNER`, never degrades `OWNER`, rejects `REVOKED` targets, and keeps
  `ADMIN` blocked from mutating themself or any `OWNER`.
- `PATCH /organizations/:organizationId/memberships/:membershipId/status`
  accepts only `ACTIVE` and `SUSPENDED` in the public DTO and therefore only
  supports `ACTIVE -> SUSPENDED` and `SUSPENDED -> ACTIVE` through that route.
- `DELETE /organizations/:organizationId/memberships/:membershipId` and
  `POST /organizations/:organizationId/memberships/leave` both end in
  historical `REVOKED` rows; neither route deletes the membership record.
- Invitation acceptance now permits re-entry when the recipient has only
  `REVOKED` history in that organization. If an `INVITED`, `ACTIVE`, or
  `SUSPENDED` membership already exists for that `organizationId + userId`,
  acceptance fails with conflict.
- Tenant resolution and `GET /auth/context` ignore `REVOKED` history and never
  authorize from `INVITED` or `SUSPENDED` memberships. Role and status changes
  take effect on the next request without minting a new JWT.

POST-GO-LIVE.3.1 organization-update DTOs allow only:

- `legalName`
- `displayName`
- `slug`
- `timezone`
- `locale`
- `currency`

`status` remains server-owned and requires the dedicated
`PATCH /organizations/:organizationId/status` operation. A suspended
organization remains unreadable to ordinary tenant-aware business routes such
as Patients, Case Files, Documents, Appointments, and Finance; only the
organization administrative read/update/status routes opt into suspended-state
resolution so an authorized `OWNER` can inspect and reactivate the tenant
without minting a new JWT.
