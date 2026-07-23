# API Documentation

> REST API contract for the Psychology Management System Backend

# Purpose

This document defines the public REST API contract exposed by the backend.

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
* Public endpoint: `POST /auth/login`

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

* `ADMIN` has full access to all resources.
* `PSYCHOLOGIST` can only access resources owned by them.
* If a resource exists but does not belong to the authenticated `PSYCHOLOGIST`, the API returns `404 Not Found`.
* For `PSYCHOLOGIST`, ownership fields sent in request bodies are ignored and replaced with the authenticated user ID when applicable.

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

## `POST /patients`

Creates a patient.

### Authentication

Bearer Token required.

### Body

```json
{
  "psychologistId": "uuid",
  "firstName": "string",
  "lastName": "string",
  "phoneNumber": "string | optional",
  "email": "string | optional",
  "birthDate": "date | optional"
}
```

### Ownership

* `ADMIN` can use `psychologistId` from the request body.
* `PSYCHOLOGIST` ignores `psychologistId` from the body and uses `user.id`.

---

## `GET /patients`

Lists patients ordered by `createdAt desc`.

### Authentication

Bearer Token required.

### Ownership

* `ADMIN` sees all patients.
* `PSYCHOLOGIST` only sees patients where `patient.psychologistId === user.id`.

---

## `GET /patients/:id`

Gets a patient by ID.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Ownership

* `ADMIN` can access any patient.
* `PSYCHOLOGIST` can only access owned patients.

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

* `ADMIN` can update any patient.
* `PSYCHOLOGIST` can only update owned patients.
* `PSYCHOLOGIST` cannot reassign ownership to another psychologist.

---

## `DELETE /patients/:id`

Deletes a patient.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Ownership

* `ADMIN` can delete any patient.
* `PSYCHOLOGIST` can only delete owned patients.

---

# Case Files

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

* Validates that the patient exists.
* Validates patient ownership for `PSYCHOLOGIST`.
* Rejects creating a second case file for the same patient.

---

## `GET /case-files`

Lists case files ordered by `createdAt desc`.

### Authentication

Bearer Token required.

### Ownership

* `ADMIN` sees all case files.
* `PSYCHOLOGIST` only sees case files from owned patients.

---

## `GET /case-files/patient/:patientId`

Gets the case file by patient ID.

### Authentication

Bearer Token required.

### Params

* `patientId: uuid`

### Ownership

* `ADMIN` can access any patient case file.
* `PSYCHOLOGIST` can only access it if the patient belongs to them.

---

## `GET /case-files/:id`

Gets a case file by ID.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Ownership

* `ADMIN` can access any case file.
* `PSYCHOLOGIST` can only access case files from owned patients.

---

## `GET /case-files/:id/workspace`

Gets an aggregated clinical workspace for a case file.

This endpoint reduces frontend composition across case files, patients, appointments, session notes and documents.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Ownership

* `ADMIN` can access any case file workspace.
* `PSYCHOLOGIST` can only access workspaces for case files from owned patients.
* If the case file exists but is not accessible to the authenticated `PSYCHOLOGIST`, the API returns `404 Not Found`.

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

* `ADMIN` can update any case file.
* `PSYCHOLOGIST` can only update case files from owned patients.

---

# Session Notes

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

* `ADMIN` can use `authorId` from the request body.
* `PSYCHOLOGIST` must own the case file.
* For `PSYCHOLOGIST`, `authorId` is replaced with `user.id`.

---

## `GET /session-notes`

Lists session notes ordered by `sessionDate desc`.

### Authentication

Bearer Token required.

### Ownership

* `ADMIN` sees all session notes.
* `PSYCHOLOGIST` only sees notes from case files of owned patients.

---

## `GET /session-notes/case-file/:caseFileId`

Lists notes for a case file ordered by `sessionDate desc`.

### Authentication

Bearer Token required.

### Params

* `caseFileId: uuid`

### Ownership

* `ADMIN` can access any case file notes.
* `PSYCHOLOGIST` can only access notes if the case file belongs to one of their patients.

---

## `GET /session-notes/:id`

Gets a session note by ID.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Ownership

* `ADMIN` can access any note.
* `PSYCHOLOGIST` can only access notes from case files of owned patients.

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

* `ADMIN` can update any note.
* `PSYCHOLOGIST` can only update notes from case files of owned patients.

---

## `DELETE /session-notes/:id`

Deletes a session note.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Ownership

* `ADMIN` can delete any note.
* `PSYCHOLOGIST` can only delete notes from case files of owned patients.

---

# Documents

The `documents` module supports metadata management, physical file upload, secure download and inline preview.

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
* Sets `uploadedById` from the authenticated JWT user.
* Legacy clients may still send `uploadedById`, but the backend ignores it.

### Ownership

* `ADMIN` can upload to any accessible case file.
* `PSYCHOLOGIST` must own the case file.
* For every role, `uploadedById` is replaced with `user.id`.

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

* `ADMIN` can use `uploadedById` from the body.
* `PSYCHOLOGIST` must own the case file.
* For `PSYCHOLOGIST`, `uploadedById` is replaced with `user.id`.

### Note

This endpoint should be reviewed in future versions to decide whether metadata-only document creation should remain supported.

---

## `GET /documents`

Lists documents ordered by `uploadedAt desc`.

### Authentication

Bearer Token required.

### Ownership

* `ADMIN` sees all documents.
* `PSYCHOLOGIST` only sees documents from case files of owned patients.

---

## `GET /documents/case-file/:caseFileId`

Lists documents for a case file.

### Authentication

Bearer Token required.

### Params

* `caseFileId: uuid`

### Ownership

* `ADMIN` can access any case file documents.
* `PSYCHOLOGIST` can only access documents if the case file belongs to one of their patients.

---

## `GET /documents/:id`

Gets document metadata by ID.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Ownership

* `ADMIN` can access any document.
* `PSYCHOLOGIST` can only access documents from case files of owned patients.

---

## `GET /documents/:id/download`

Downloads the physical file associated with the document.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Behavior

* Finds document metadata by ID.
* Validates ownership before accessing the filesystem.
* Validates that the physical file exists.
* Resolves the file path from `UPLOADS_PATH` or `uploads`.
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
* Validates ownership before accessing the filesystem.
* Validates that the physical file exists.
* Resolves the file path from `UPLOADS_PATH` or `uploads`.
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

* `ADMIN` can update any document.
* `PSYCHOLOGIST` can only update documents from case files of owned patients.

---

## `DELETE /documents/:id`

Deletes the document record.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Behavior

* Deletes only the database record.
* Does not delete the physical file from disk.

### Ownership

* `ADMIN` can delete any document.
* `PSYCHOLOGIST` can only delete documents from case files of owned patients.

---

# Appointments

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

* `ADMIN` can use `psychologistId` from the body.
* `PSYCHOLOGIST` must own the patient.
* For `PSYCHOLOGIST`, `psychologistId` is replaced with `user.id`.

---

## `GET /appointments`

Lists appointments ordered by `scheduledAt desc`.

### Authentication

Bearer Token required.

### Ownership

* `ADMIN` sees all appointments.
* `PSYCHOLOGIST` only sees appointments where `appointment.psychologistId === user.id`.

---

## `GET /appointments/patient/:patientId`

Lists appointments for a patient.

### Authentication

Bearer Token required.

### Params

* `patientId: uuid`

### Ownership

* `ADMIN` can access any patient's appointments.
* `PSYCHOLOGIST` can only access appointments if the patient belongs to them.

---

## `GET /appointments/:id`

Gets an appointment by ID.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Ownership

* `ADMIN` can access any appointment.
* `PSYCHOLOGIST` can only access owned appointments.

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

* `ADMIN` can update any appointment.
* `PSYCHOLOGIST` can only update owned appointments.
* `PSYCHOLOGIST` cannot reassign ownership to another psychologist.

---

## `DELETE /appointments/:id`

Deletes an appointment.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Ownership

* `ADMIN` can delete any appointment.
* `PSYCHOLOGIST` can only delete owned appointments.

---

# Financial Transactions

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
  "appointmentId": "uuid | optional",
  "createdById": "uuid | optional"
}
```

### Behavior

* `amount` must be positive.
* `type`, `amount`, `concept` and `occurredAt` are required.
* Prisma applies defaults for `status`, `category` and `currency`.
* If `patientId` is provided, the patient must exist.
* If `appointmentId` is provided, the appointment must exist.
* If both are provided, the appointment must belong to the same patient.
* If `createdById` is provided by `ADMIN`, the user must exist.

### Ownership

* `ADMIN` can create transactions for any valid user, patient or appointment.
* `PSYCHOLOGIST` ignores `createdById` from the body and always uses `user.id`.
* `PSYCHOLOGIST` can only associate owned patients and owned appointments.

### Errors

* `400 Bad Request` for invalid payloads or mismatched `patientId` / `appointmentId`.
* `404 Not Found` when a related patient, appointment or user does not exist or is not accessible.

---

## `GET /financial-transactions`

Lists financial transactions ordered by `occurredAt desc`.

### Authentication

Bearer Token required.

### Ownership

* `ADMIN` sees all transactions.
* `PSYCHOLOGIST` sees transactions when:
  * `createdById === user.id`, or
  * the transaction belongs to an owned patient, or
  * the transaction belongs to an owned appointment.

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
* `ADMIN` may filter by any supported field.
* `PSYCHOLOGIST` may only see owned records under the existing ownership rules.
* If `PSYCHOLOGIST` sends `createdById`, the backend constrains it to `user.id`.
* If `PSYCHOLOGIST` sends `patientId` or `appointmentId`, non-owned values return an empty result set instead of exposing resource existence.

### Notes

* This module now supports basic filtering.
* Pagination, tax invoicing, bank reconciliation and advanced dashboards remain out of scope.

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

* Uses the same visibility and filter rules as `GET /financial-transactions`.

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
* For `PSYCHOLOGIST`, non-owned `patientId` and `appointmentId` filters resolve to an empty summary instead of exposing resource existence.

---

## `GET /financial-transactions/:id`

Gets a financial transaction by ID.

### Authentication

Bearer Token required.

### Params

* `id: uuid`

### Ownership

* `ADMIN` can access any transaction.
* `PSYCHOLOGIST` can only access transactions visible under the base ownership rules.
* If the transaction exists but is not accessible, the API returns `404 Not Found`.

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
  "appointmentId": "uuid | optional",
  "createdById": "uuid | optional"
}
```

### Behavior

* Relational validations from creation also apply on update.
* `ADMIN` may change `createdById` only to an existing user.
* `PSYCHOLOGIST` cannot change ownership through `createdById`.
* Reassignments remain conservative and must stay within accessible relations.

### Ownership

* `ADMIN` can update any transaction.
* `PSYCHOLOGIST` can only update transactions visible under the base ownership rules.
* If the transaction exists but is not accessible, the API returns `404 Not Found`.

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

* `ADMIN` can delete any transaction.
* `PSYCHOLOGIST` can only delete transactions visible under the base ownership rules.
* If the transaction exists but is not accessible, the API returns `404 Not Found`.

### Notes

* This module does not include tax invoicing or bank reconciliation logic.

---

# Pending API Improvements

The following items should be reviewed in future backend sprints:

* Define standard error response format.
* Add pagination contract for list endpoints.
* Add search/filter query parameters.
* Decide whether `POST /documents` should remain available.
* Decide whether `DELETE /documents/:id` should also delete the physical file.
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
selection. Existing clinical endpoints remain tenant-optional in this phase and
retain their legacy ownership behavior, except for the Patients pilot. Patients
requires a resolved context and continues to apply its separate legacy
psychologist ownership condition; all other clinical modules remain legacy
until 2.1D.

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
