# Architecture

> Backend architecture for the Psychology Management System Backend.

---

# Purpose

This document describes the backend architecture and explains how the different components interact.

It documents:

- System architecture
- Core components
- Authorization flow
- Ownership model
- Upload architecture
- Security model
- Design decisions

Business rules are documented in `PROJECT.md`.

Database relationships are documented in `DATA_MODEL.md`.

API contracts are documented in `API.md`.

---

# Overview

The backend is a REST API built with NestJS using PostgreSQL through Prisma ORM.

Current capabilities include:

- JWT authentication
- Role-based authorization
- Ownership filtering
- Clinical data management
- Financial transactions CRUD base
- Clinical workspace aggregation
- Local filesystem document storage

The application follows a modular architecture where business logic resides in services and persistence is handled through Prisma.

---

# Technology Stack

Current backend technologies:

- NestJS
- TypeScript
- Prisma ORM
- PostgreSQL
- JWT
- Swagger
- Docker Compose

---

# High-Level Components

## NestJS API

Responsibilities:

- Expose REST endpoints
- Validate request payloads
- Authenticate users
- Authorize requests
- Apply ownership filtering
- Execute business logic

Current modules:

- AuthModule
- PatientsModule
- CaseFilesModule
- SessionNotesModule
- DocumentsModule
- AppointmentsModule
- FinancialTransactionsModule
- PrismaModule

---

## Prisma ORM

Responsibilities:

- Entity modeling
- Database access
- Relationship management
- Query execution

Prisma is the persistence layer between NestJS and PostgreSQL.

---

## PostgreSQL

Stores all application data, including:

- Users
- Patients
- Case Files
- Session Notes
- Documents
- Appointments
- Financial Transactions

---

## Local Filesystem

Uploaded clinical documents are stored on disk.

The database stores only metadata.

Directory structure:

```text
uploads/
  patients/
    {patientId}/
      {uuid}.pdf|jpg|jpeg|png
```

Stored metadata includes:

- fileName
- filePath
- mimeType
- uploadedAt
- caseFileId
- uploadedById

---

# Request Flow

Typical request lifecycle:

```text
Client
    │
    ▼
Controller
    │
    ▼
DTO Validation
    │
    ▼
JwtAuthGuard
    │
    ▼
RolesGuard
    │
    ▼
Ownership Validation
    │
    ▼
Business Service
    │
    ▼
Prisma ORM
    │
    ▼
PostgreSQL
```

---

# Authorization Flow

Authentication flow:

```text
Client

↓

POST /auth/login

↓

JWT Generation

↓

Bearer Token

↓

JwtAuthGuard

↓

RolesGuard

↓

Ownership Validation

↓

Business Logic
```

Current roles:

- ADMIN
- PSYCHOLOGIST

Authorization rules:

- ADMIN has unrestricted access.
- PSYCHOLOGIST can only access owned clinical resources.

---

# Ownership Model

Ownership filtering is enforced inside services before database access.

Current ownership rules:

## Patients

- ADMIN can access every patient.
- PSYCHOLOGIST only accesses owned patients.

---

## Case Files

- ADMIN can access every case file.
- PSYCHOLOGIST only accesses case files from owned patients.

---

## Session Notes

- ADMIN can access every session note.
- PSYCHOLOGIST only accesses notes from owned patients.

---

## Documents

- ADMIN can access every document.
- PSYCHOLOGIST only accesses documents from owned patients.

---

## Appointments

- ADMIN can access every appointment.
- PSYCHOLOGIST only accesses owned appointments.

---

# Clinical Workspace Aggregation

The `GET /case-files/:id/workspace` endpoint aggregates the current clinical workspace for a single case file.

It is implemented in the Case Files module because the workspace is anchored by the clinical record.

The endpoint reads:

- Case file fields
- Owning patient fields
- Appointments for the owning patient
- Session notes for the case file
- Documents for the case file

Ownership is resolved before returning the aggregate:

- ADMIN can access any workspace.
- PSYCHOLOGIST can only access workspaces for owned patients.
- Inaccessible workspaces return `404 Not Found`, matching the protected module convention.

The timeline is a derived API projection, not a database table.

Initial timeline events:

- `CASE_FILE_CREATED` from `caseFile.createdAt`
- `SESSION_NOTE_CREATED` from `sessionNote.sessionDate`
- `DOCUMENT_UPLOADED` from `document.uploadedAt`
- `APPOINTMENT_COMPLETED` from completed appointment `scheduledAt`

No synthetic events are created for updates or status changes without a clear persisted source timestamp.

---

## Financial Transactions

- Ownership is resolved through `patientId`, `appointmentId` or `createdById`.
- The model must not duplicate ownership with a `psychologistId` column.
- CRUD access is enforced in the financial transactions service with the same `404` convention used by other protected modules.

---

# Document Upload Flow

```text
Client

↓

multipart/form-data

↓

DocumentsController

↓

Ownership Validation

↓

MIME Validation

↓

Filesystem Storage

↓

Document Metadata

↓

Prisma

↓

PostgreSQL
```

Current restrictions:

- Maximum size: 10 MB
- Allowed types:
  - PDF
  - JPG
  - JPEG
  - PNG

---

# Secure File Access

Document download and preview follow the same security pipeline.

```text
Document ID

↓

Ownership Validation

↓

Filesystem Validation

↓

Path Normalization

↓

File Exists

↓

Download / Inline Preview
```

Current protections:

- UUID validation
- Ownership validation
- Path normalization
- Path traversal prevention
- Physical file existence validation

---

# Security

Current security features include:

- JWT authentication
- bcrypt password hashing
- JwtAuthGuard
- RolesGuard
- Ownership filtering
- DTO validation
- UUID validation
- MIME validation
- Upload size restrictions
- Path traversal protection

Current MVP intentionally does not include:

- Refresh Tokens
- Password Reset
- Audit Logs
- External Object Storage
- Backup Strategy

---

# Design Decisions

## Why NestJS?

Provides modular architecture, dependency injection and excellent scalability.

---

## Why Prisma?

Offers a strongly typed ORM with excellent PostgreSQL integration.

---

## Why PostgreSQL?

Provides relational consistency for clinical data.

---

## Why Local Filesystem?

Filesystem storage is sufficient for the MVP while keeping deployment simple.

Future versions may migrate to external object storage.

---

## Why Ownership Filtering?

Ownership filtering prevents users from accessing clinical resources that do not belong to them while keeping authorization centralized inside business services.

---

# Future Evolution

Future architecture may include:

- Object Storage
- Redis
- Background Workers
- Audit Logging
- Refresh Tokens
- Multi-tenant Organizations
- External Integrations

These features should extend the current architecture without replacing it.

---

# References

Related documentation:

- PROJECT.md
- DATA_MODEL.md
- API.md
- DOCKER.md
- ROADMAP.md

End of document.
