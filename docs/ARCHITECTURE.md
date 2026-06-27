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
- Financial data modeling through Prisma
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

## Financial Transactions

- Current sprint adds only the Prisma data model.
- Future ownership rules must resolve through `patientId`, `appointmentId` or `createdById`.
- The model must not duplicate ownership with a `psychologistId` column.

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
