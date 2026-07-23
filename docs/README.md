# Backend Documentation

> Technical documentation for the Psychology Management System Backend.

---

# Purpose

This directory contains the technical documentation for the backend.

The goal of this documentation is to provide a single source of truth for the project's architecture, API, data model, infrastructure and development roadmap.

Product vision is documented separately in the repository root.

---

# Reading Order

New developers and AI agents should read the documentation in the following order:

1. `PROJECT.md`
2. `AGENTS.md`
3. `docs/README.md`
4. `ARCHITECTURE.md`
5. `DATA_MODEL.md`
6. `API.md`
7. `DOCKER.md`
8. `ROADMAP.md`

This order provides business context before technical implementation details.

---

# Documents

## ARCHITECTURE.md

Describes the backend architecture.

Includes:

* Technology stack
* System architecture
* Request flow
* Authorization flow
* Upload flow
* Design decisions

---

## DATA_MODEL.md

Documents the database model.

Includes:

* Entities
* Relationships
* Ownership
* Clinical rules
* Business constraints

---

## API.md

Defines the REST API contract.

Includes:

* Authentication
* Ownership rules
* Endpoints
* Request and response contracts
* Future API improvements

---

## DOCKER.md

Documents the development and deployment environment.

Includes:

* Docker Compose
* Containers
* Volumes
* Environment variables
* Common commands
* Deployment notes

## PRISMA_MIGRATION_ARTIFACT.md

Documents the dedicated immutable Prisma migration image used by the
POST-GO-LIVE schema procedure, including local PostgreSQL 16 validation and
digest-based publication.

## SaaS authorization contracts

`AUTHORIZATION_CONTRACT.md` is the primary source of truth for the phased SaaS
authorization model. Its companion documents are:

* `AUTHORIZATION_CAPABILITY_MATRIX.md`
* `TENANT_ENDPOINT_SCOPE_MATRIX.md`
* `TENANT_SECURITY_TEST_CONTRACT.md`
* `adr/ADR-TENANT-CONTEXT.md`
* `adr/ADR-TENANT-DATA-ISOLATION.md`

They specify the approved target design and distinguish it from current runtime
enforcement. They do not themselves change database, API, or runtime behavior.

---

## ROADMAP.md

Documents the project evolution.

Includes:

* Current MVP status
* Completed features
* Current sprint
* Planned features
* Long-term vision

---

# Repository Documents

The repository root also contains two important documents.

## PROJECT.md

Defines:

* Product vision
* Clinical workflow
* MVP scope
* Long-term goals

---

## AGENTS.md

Defines:

* AI development rules
* Coding expectations
* Project conventions
* Agent workflow

---

# Source of Truth

The current source of truth for the backend is:

* `/docs`
* `PROJECT.md`
* `AGENTS.md`

Avoid creating duplicate documentation outside these files.

When documentation becomes outdated, update the existing document instead of creating a new version.

---

# Documentation Principles

Documentation should remain:

* Accurate
* Concise
* Up to date
* Consistent

Each document has a single responsibility and should avoid duplicating information found elsewhere.

End of document.
