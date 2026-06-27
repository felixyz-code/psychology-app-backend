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
* `uploadedById: uuid`

### Behavior

* Stores the file on disk.
* Creates a `Document` record.
* Preserves `fileName` with the original filename.
* Stores `filePath` as a relative path.
* Uses the structure `patients/{patientId}/{uuid}.{ext}`.

### Ownership

* `ADMIN` can use `uploadedById` from the body.
* `PSYCHOLOGIST` must own the case file.
* For `PSYCHOLOGIST`, `uploadedById` is replaced with `user.id`.

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

# Pending API Improvements

The following items should be reviewed in future backend sprints:

* Define standard error response format.
* Add pagination contract for list endpoints.
* Add search/filter query parameters.
* Define the future REST contract for financial transactions.
* Decide whether `POST /documents` should remain available.
* Decide whether `DELETE /documents/:id` should also delete the physical file.
* Replace root `GET /` response with a health or API status endpoint.

# References

PROJECT.md

ARCHITECTURE.md

DATA_MODEL.md

DOCKER.md
