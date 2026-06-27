## Documentation

Before making architectural or business assumptions:

1. Read PROJECT.md.
2. Read docs/README.md.
3. Open any additional document required for the requested task.

Never assume undocumented behavior.
Always treat the documentation under /docs as the current source of truth.

> AI Development Guidelines for the Psychology Management System Backend

## Purpose

This file defines how AI agents should work inside this backend repository.

For product context, architecture, API contracts, database model and operational details, agents must consult the project documentation instead of guessing.

## Source of Truth

Before making architectural or domain assumptions, consult the documentation in this order:

1. `PROJECT.md`
2. `docs/README.md`
3. `docs/ARCHITECTURE.md`
4. `docs/DATA_MODEL.md`
5. `docs/API.md`
6. `docs/DOCKER.md`
7. `docs/ROADMAP.md`

The `/docs` directory represents the current technical source of truth.

Do not rely on outdated `v1` documentation if it exists.

## Core Rules

* Keep controllers thin.
* Keep business logic inside services.
* Use DTOs for input validation.
* Use Prisma as the database access layer.
* Preserve ownership filtering.
* Preserve JWT authentication.
* Do not expose sensitive clinical data.
* Do not modify unrelated modules.
* Do not introduce SaaS complexity unless explicitly requested.
* Prefer small, focused changes.
* Avoid destructive database changes.
* Do not change public API contracts without approval.

## Clinical Domain

This is a clinical management system, not a generic CRUD app.

Main clinical flow:

```text
User
  |
  v
Patient
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

Appointments are operational data and may later connect to clinical session notes.

Clinical information must be preserved, protected and handled carefully.

## Current MVP Focus

The current MVP targets an independent psychologist.

Do not implement multi-tenancy, organizations, subscriptions, billing or patient portal features unless explicitly requested.

## Agent Workflow

For small isolated changes:

1. Analyze the request.
2. Modify only the necessary files.
3. Summarize the changes.

For larger changes involving architecture, database schema, multiple modules or public API behavior:

1. Analyze the request.
2. Identify affected files.
3. Propose a short implementation plan.
4. Wait for approval.
5. Implement only the approved scope.
6. Summarize modified files, risks and next steps.

## Forbidden Actions

Never:

* Remove authentication.
* Disable authorization.
* Bypass ownership filtering.
* Hardcode secrets.
* Log passwords, JWTs or clinical notes.
* Return fake data.
* Delete production data.
* Rewrite unrelated modules.
* Modify database schema without approval.
* Change endpoint contracts without approval.
* Introduce unnecessary dependencies.

## Definition of Done

A task is complete when:

* The code compiles.
* Validation remains correct.
* Ownership rules remain valid.
* Sensitive data is protected.
* Only necessary files were modified.
* Existing behavior is preserved unless a change was requested.
* The implementation follows the documentation in `/docs`.

End of document.
