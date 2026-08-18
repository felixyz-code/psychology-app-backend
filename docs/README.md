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

- Technology stack
- System architecture
- Request flow
- Authorization flow
- Upload flow
- Design decisions

---

## DATA_MODEL.md

Documents the database model.

Includes:

- Entities
- Relationships
- Ownership
- Clinical rules
- Business constraints

---

## API.md

Defines the REST API contract.

Includes:

- Authentication
- Public freelancer bootstrap
- Ownership rules
- Endpoints
- Request and response contracts
- Future API improvements

---

## DOCKER.md

Documents the development and deployment environment.

Includes:

- Docker Compose
- Containers
- Volumes
- Environment variables
- Common commands
- Deployment notes

## DEVELOPMENT_SEED_AND_POSTMAN.md

Documents the tenant-aware local development seed and the local Postman
collection artifacts introduced by POST-GO-LIVE.2.2 as tooling after tenant
platform certification.

## DECISION_LOG.md

Records local development and release-gate decisions that affect how auxiliary
tooling is certified or deferred.

## PRISMA_MIGRATION_ARTIFACT.md

Documents the dedicated immutable Prisma migration image used by the
POST-GO-LIVE schema procedure, including local PostgreSQL 16 validation and
digest-based publication.

## POST_GO_LIVE_3_0_ORGANIZATION_MEMBERSHIP_ADMINISTRATION_CONTRACT.md

Documents the POST-GO-LIVE.3.0 architectural audit, gap analysis, and
normative contract for organization administration, membership lifecycle,
ownership, invitations, and active organization selection.

## POST_GO_LIVE_3_PHASE_CLOSEOUT.md

Documents the formal closeout package for POST-GO-LIVE.3 after the
organization, membership, invitation, ownership-transfer, freelancer-bootstrap,
and preferred-organization runtime modules were integrated.

## SaaS authorization contracts

`AUTHORIZATION_CONTRACT.md` is the primary source of truth for the phased SaaS
authorization model. Its companion documents are:

- `AUTHORIZATION_CAPABILITY_MATRIX.md`
- `TENANT_ENDPOINT_SCOPE_MATRIX.md`
- `TENANT_SECURITY_TEST_CONTRACT.md`
- `POST_GO_LIVE_2_1D0_TENANT_CONVERSION_CONTRACT.md`
- `POST_GO_LIVE_2_1_TENANT_PLATFORM_CERTIFICATION.md`
- `adr/ADR-TENANT-CONTEXT.md`
- `adr/ADR-TENANT-DATA-ISOLATION.md`

They specify the approved target design and distinguish it from current runtime
enforcement. They do not themselves change database, API, or runtime behavior.
`POST_GO_LIVE_2_1D0_TENANT_CONVERSION_CONTRACT.md` is the normative
documentation-only contract for the 2.1D clinical and financial module
conversion sequence.
`POST_GO_LIVE_2_1_TENANT_PLATFORM_CERTIFICATION.md` is the D5 readiness report
for the converted tenant-aware clinical and financial platform.
`POST_GO_LIVE_3_0_ORGANIZATION_MEMBERSHIP_ADMINISTRATION_CONTRACT.md` is the
normative POST-GO-LIVE.3.0 contract for the organization domain after the D0
through D5 tenant platform baseline and POST-GO-LIVE.2.2 tooling baseline. It
is now merged and closed as a specification baseline on commit
`7d897ec8db2c5d372fce0b4dc0eaf3bd3b1d4b13`; POST-GO-LIVE.3.1 and
POST-GO-LIVE.3.2 are now closed and integrated as the organization and
membership administration runtime baseline. POST-GO-LIVE.3.3 invitation
administration runtime is closed and integrated on merge commit
`5bb75dc4ae8deed67543f745abb23bac88508066` via PR `#39`. POST-GO-LIVE.3.4
ownership transfer runtime is closed and integrated on merge commit
`77b4b6e6a70ef133459b84ea71c5d9590bfb6d0a` as of Friday, July 31, 2026.
POST-GO-LIVE.3.5 public freelancer bootstrap runtime is closed and integrated
on merge commit `7b456901074807891c0384e214181e2ec8417d37` via PR `#41` on
Sunday, August 2, 2026. POST-GO-LIVE.3.6 preferred organization UX runtime is
closed and integrated on merge commit
`6c65a4d8956723071514c40ec6942ecc39c0dcd2` via PR `#42` on Sunday, August 2,
2026. Phase 3 functional work is complete, and the formal closeout is tracked
in `POST_GO_LIVE_3_PHASE_CLOSEOUT.md` as review pending.

Additional ADRs for the organization domain include:

- `adr/ADR-ORGANIZATION-ACTIVE-SELECTION.md`

---

## ROADMAP.md

Documents the project evolution.

Includes:

- Current MVP status
- Completed features
- Current sprint
- Planned features
- Long-term vision

---

# Repository Documents

The repository root also contains two important documents.

## PROJECT.md

Defines:

- Product vision
- Clinical workflow
- MVP scope
- Long-term goals

---

## AGENTS.md

Defines:

- AI development rules
- Coding expectations
- Project conventions
- Agent workflow

---

# Source of Truth

The current source of truth for the backend is:

- `/docs`
- `PROJECT.md`
- `AGENTS.md`

Avoid creating duplicate documentation outside these files.

When documentation becomes outdated, update the existing document instead of creating a new version.

---

# Documentation Principles

Documentation should remain:

- Accurate
- Concise
- Up to date
- Consistent

Each document has a single responsibility and should avoid duplicating information found elsewhere.

End of document.
