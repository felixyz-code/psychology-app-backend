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

- Node.js `^20.19 || >=22.12 <23`
- npm `>=10 <11`
- NestJS
- TypeScript
- Prisma ORM
- PostgreSQL
- JWT
- Swagger
- Docker Compose

Quality scripts separate read-only gates from mutating helpers. `build`,
`typecheck`, `lint`, `format:check` and tests are safe for validation workflows.
`lint:fix` and `format` may rewrite files and are intended for local
remediation. The Backend CI workflow runs these quality gates together with
Prisma migration, PostgreSQL integration and Docker image-build checks.

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
- Centralized runtime configuration validation
- DTO validation
- HTTP security headers through Helmet, without the Express `X-Powered-By` fingerprint
- UUID validation
- MIME validation
- PDF, JPEG and PNG signature validation for uploads
- Upload size restrictions
- Path traversal protection

Runtime configuration is centralized in the backend configuration module.
Startup validation runs before the server accepts traffic. It requires
`DATABASE_URL` and `JWT_SECRET`, restricts `NODE_ENV` to `development`, `test`
or `production`, and reports invalid variable names without printing secret
values. Production additionally requires an explicit `CORS_ORIGIN` and an
absolute `UPLOADS_PATH`; Swagger is disabled unless explicitly enabled.

Helmet supplies the standard application-level security headers, including
`X-Content-Type-Options`, frame protection and `Referrer-Policy`. The Content
Security Policy allows the same-origin Swagger UI's required inline setup and
styles, while `upgrade-insecure-requests` and HSTS are disabled in the
backend. HTTPS redirect and HSTS belong to the TLS-terminating reverse proxy
deployment layer and must be configured by Infra.

`trust proxy` remains disabled by default. Infra may set
`TRUST_PROXY_HOPS` to `1` or `2` only after documenting the exact proxy chain;
the backend never trusts forwarded headers indiscriminately.

Rate limiting is an Infra responsibility for this MVP. The reverse proxy/WAF
must enforce route-specific controls for login, authenticated API routes,
uploads, downloads and reports. It must exclude `/health/live` and
`/health/ready`, which are deliberately unauthenticated probe endpoints.

## Production Operations

Container startup validates configuration, optionally applies versioned Prisma
migrations when `MIGRATE_ON_START=true`, and then starts the Node process as
the unprivileged `node` user. Production web containers keep
`MIGRATE_ON_START=false`; a one-shot deployment job runs `prisma migrate deploy`
before the web container starts. The production entrypoint runs
`prisma migrate status` as an operational guard and refuses to start if the
migration history is not reconciled.

This guard does not reconcile a database, replace backups, or compare deployed
and expected schemas. It complements the BE.7.2P reconciliation process rather
than replacing it, and never runs `prisma migrate resolve` or `prisma db push`.

Structured application logs provide request latency and HTTP status signals,
including `429` when produced by an application layer. Prisma request errors
and post-delete document-cleanup failures emit sanitized event names and error
codes/types only. Infra must collect reverse-proxy `429` signals, container
restarts, readiness/liveness probe failures and PostgreSQL availability.

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

## Legacy SaaS Backfill Boundary

The manifest-driven `saas:legacy-backfill` command is an offline data
preparation tool. It is intentionally outside the Nest request path and is not
called by seed, startup or Prisma migration deployment. It does not introduce
a TenantResolver, organization filtering or authorization changes. Existing
ownership filtering continues to use `psychologistId` and global `User.role`
until a later explicitly approved enforcement phase.

Its serializable transaction, prevalidation and postvalidation protect the
data-preparation operation without claiming to provide a business audit trail.
Operational use, dry-run, apply confirmation and non-production rollback are
documented in `SAAS_LEGACY_BACKFILL.md`.

## Tenant Context Foundation (POST-GO-LIVE.1.6)

Authenticated requests now pass through `TenantContextGuard` after JWT
authentication and before legacy role authorization. The guard resolves active
memberships from PostgreSQL, validates the selected organization is `ACTIVE`,
and places one immutable context in the existing request `AsyncLocalStorage`.
The same object is exposed on the request only for the `@CurrentTenant()`
parameter decorator; neither path reads a client header after resolution.

`X-Organization-Id` is an optional UUID selection request, not evidence of
access. It is checked against the authenticated user's active membership on
every request. Without the header, exactly one eligible membership resolves
automatically; multiple eligible memberships deliberately remain unresolved;
zero memberships preserve legacy compatibility for optional routes. No legacy
clinical query has changed: `psychologistId` and global `User.role` remain the
runtime ownership and authorization mechanisms.

`LEGACY_COMPATIBILITY` is an absence of tenant context, not a virtual
organization or membership and not tenant authorization. It never permits an
organization ID from a header or request body to become authoritative.

New organizational routes use `@TenantRequired()`; existing authenticated
routes are tenant-optional by default, and `@Public()` routes bypass resolution.
`GET /auth/context` is authenticated but tenant-optional to avoid a
multi-membership bootstrap cycle: unresolved users receive only their own
selectable memberships and can retry with `X-Organization-Id`. A later
enforcement phase can opt clinical endpoints into `@TenantRequired()`
individually.

`@SkipTenantContext()` takes precedence over `@TenantRequired()` so explicit
infrastructure or public bypasses cannot accidentally perform a membership
query. The combination is reserved for intentional framework routes and is
covered by guard tests.

The membership query is `OrganizationMembership` filtered by `(userId,
status=ACTIVE)`, backed by `organization_memberships_userId_status_idx`; the
selected organization is joined in that same query. There is intentionally no
cache, because revocation, role changes and organization suspension must take
effect on the next request. Any future cache needs explicit invalidation for
those mutations.

---

# References

Related documentation:

- PROJECT.md
- DATA_MODEL.md
- API.md
- DOCKER.md
- ROADMAP.md

End of document.
