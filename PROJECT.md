# PROJECT.md

> Product Vision and Project Context

## Project Name

Psychology Management System Backend

## Purpose

This backend powers a clinical management system for psychology professionals.

The system helps manage:

* Authentication
* Patients
* Clinical case files
* Session notes
* Documents
* Appointments

The current MVP is designed for an independent psychologist.

The long-term vision is to evolve into a multi-specialist SaaS platform, but SaaS-specific complexity should not be introduced until explicitly required.

## Current Product Stage

Status:

```text
Active MVP Development
```

Current focus:

* Backend stabilization
* Clinical workflow validation
* Frontend integration
* Documentation cleanup
* Docker-based development workflow
* Future VPS deployment preparation

## Clinical Workflow

The system follows this core clinical workflow:

```text
Login
  |
  v
Patient Management
  |
  v
Case File
  |
  v
Session Notes
  |
  v
Documents
```

Appointments exist as operational scheduling data.

Documents are currently linked to case files.

## MVP Scope

Included in the current MVP:

* JWT authentication
* Roles
* Ownership filtering
* Patients
* Case files
* Session notes
* Documents
* File upload, view and download
* Appointments
* Swagger documentation
* Docker Compose development setup

Out of scope for the current MVP:

* Multi-tenancy
* Organizations
* Subscription billing
* Patient portal
* AI-generated notes
* External storage
* Refresh tokens
* Password reset
* Advanced audit logs

These may be added in future phases.

## Technical Source of Truth

Detailed technical documentation lives in `/docs`.

Use these documents as the current source of truth:

```text
docs/README.md
docs/ARCHITECTURE.md
docs/DATA_MODEL.md
docs/API.md
docs/DOCKER.md
docs/ROADMAP.md
```

Do not duplicate detailed API, Docker, architecture or data model information in this file.

## Documentation Responsibility

This file explains:

* Product vision
* MVP scope
* Clinical workflow
* High-level project direction

The `/docs` directory explains:

* Technical architecture
* Database model
* API contract
* Docker workflow
* Pending technical work

`AGENTS.md` explains:

* How AI agents should work in this repository

## Long-Term Vision

The project may later evolve into a SaaS product for:

* Independent psychologists
* Associations
* Clinics
* Multi-specialist teams
* Mental health organizations

Future architecture may include:

* Organizations
* Multiple users per organization
* Role-based permissions
* Billing
* Subscriptions
* Audit logs
* External file storage
* AI-assisted clinical documentation

Do not implement these features until requested.

## Final Principle

This project values:

* Clinical integrity
* Security
* Maintainability
* Professional usability
* Incremental development

Every change should move the system closer to a stable, professional and commercially viable clinical management platform.

End of document.
