# Roadmap

> Development roadmap for the Psychology Management System Backend.

---

# Purpose

This document describes the current state of the project, upcoming milestones and long-term product direction.

It is not intended to replace the product backlog.

---

# Current Status

Current phase:

```text
MVP Development
```

Current priorities:

* Backend stabilization
* Frontend development
* Clinical workflow validation
* Docker deployment
* Documentation standardization
* Financial CRUD validation

---

# Completed Milestones

## Core Infrastructure

* NestJS backend
* PostgreSQL integration
* Prisma ORM
* JWT authentication
* Swagger documentation
* Docker Compose environment

---

## Clinical Modules

* Authentication
* Users
* Patients
* Case Files
* Session Notes
* Documents
* Appointments

---

## Security

* JWT authentication
* Roles
* Ownership filtering
* UUID identifiers

---

## Infrastructure

* Docker Compose
* Persistent uploads
* PostgreSQL volumes
* Seed support

---

# Current Focus

Current development efforts include:

* Angular frontend
* UI refinement
* Clinical workflow validation
* Documentation improvements
* Financial transactions CRUD validation and basic reporting follow-up

---

# Short-Term Roadmap

## Security

* Refresh Tokens
* Password Reset
* Audit Logs
* Standardized Error Responses

---

## Infrastructure

* VPS Deployment
* Production Backups
* External Storage evaluation

---

## Quality

* Unit Tests
* Integration Tests
* Upload Tests
* Ownership Tests

---

## Product

* Search
* Filtering
* Pagination
* User Management improvements
* Advanced financial dashboards
* Bank reconciliation
* Fiscal invoicing support

---

# Medium-Term Roadmap

Potential additions after MVP completion:

* Clinical Templates
* Notifications
* Calendar improvements
* Reporting
* Dashboard enhancements
* Financial reporting

---

# Long-Term Vision

The backend should evolve toward a SaaS platform.

Potential future features:

* Organizations
* Multiple Psychologists
* Multi-tenancy
* Billing
* Subscription Plans
* AI-assisted documentation
* External Object Storage
* Advanced Permissions

These features are intentionally outside the current MVP.

---

# Known Technical Debt

Current technical debt includes:

* Prisma migrations
* Standard error contract
* Seed improvements
* API examples
* Frontend integration documentation
* Financial reporting and dashboard layers

Recent backend progress:

* Financial transactions CRUD base completed
* Financial transaction filters completed
* Basic financial summary endpoint completed

Technical debt should be addressed incrementally.

---

# Success Criteria

The MVP will be considered complete when:

* Clinical workflow is fully operational.
* Frontend and backend are integrated.
* Documentation is complete.
* Docker deployment is stable.
* VPS deployment is validated.
* The application is ready for production use by an independent psychologist.

---

# References

Related documentation:

* PROJECT.md
* ARCHITECTURE.md
* DATA_MODEL.md
* API.md
* DOCKER.md

End of document.
