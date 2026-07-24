# Tenant Security Test Contract

## Gate

Each converted module must satisfy this contract in unit, integration, and E2E tests before moving from Shadow to Enforced. Fixtures use two active organizations, distinct memberships and resources, and no PHI.

| Case | Required assertion |
| --- | --- |
| Cross-tenant read | A cannot read B's direct ID; `404` |
| Cross-tenant update/delete | No mutation occurs; `404` |
| List and relationship traversal | Lists, includes, workspace projections, and child routes exclude B |
| Document view/download | B metadata and file stream are never opened for A; `404` |
| Export/report/dashboard | Aggregate contains only selected tenant; no B count, sum, or item |
| Appointment relation attack | Foreign parent/professional gives `404`; visible incompatible pair gives `400` |
| Financial relation attack | Foreign patient/appointment gives `404`; visible mismatch gives `400` |
| Manipulated organization ID | DTO/body/query/path value cannot affect scope or create a link |
| Inactive organization | Existing token/header cannot resolve; redacted `403` |
| Suspended or revoked membership | Existing token/header cannot resolve; redacted `403` |
| Pending invitation | Invitation alone cannot resolve; tenant-required route is `403` |
| Multiple memberships | Missing selection is `409`; explicit switch isolates results |
| Tenant switch | Same JWT with two valid headers has no state bleed |
| Legacy null resource | Shadow records safe discrepancy; Enforced hides it and direct ID is `404` |
| Capability denial | Visible in-tenant action is `403` without mutation |
| Future platform exception | Explicit protocol, reason/audit event, narrow scope; no legacy ADMIN bypass |

## Database, concurrency, and Shadow

Integration tests cover scoped `findFirst`, `updateMany`, `deleteMany`, aggregate/groupBy, nested relation reads, and transaction relationship validation. Concurrent contexts prove `AsyncLocalStorage` does not leak tenant data. Database tests prove future constraints/backfill rehearsal without production databases or clinical records.

Shadow telemetry may contain only module, operation, safe reason code, mode, and bounded technical identifiers/counters. It must not contain PHI, notes, document content, email, file path, authorization header, JWT, or raw request body.

## POST-GO-LIVE.2.1D0 module-conversion gates

`POST_GO_LIVE_2_1D0_TENANT_CONVERSION_CONTRACT.md` defines the complete D1
through D4 gate list. Each converted clinical or financial module must cover at
least: missing tenant context, invalid tenant context, actor without
membership, suspended membership, inactive or suspended organization, missing
capability, unknown capability, actor from another tenant, missing ID,
cross-tenant ID, two-tenant lists, cross-tenant mutations, cross-tenant
relations, missing assignment, assignment from another tenant, legacy
`organizationId = NULL`, sanitized projections, and sanitized logs.

Freelancer coverage must prove a single `OWNER` can operate through
capabilities plus assignment without accumulated roles, including patient
creation, self-assignment, workspace access, notes, documents, appointments,
and finances. Document coverage must prove metadata authorization happens
before any physical file access.
Financial-summary coverage must prove all aggregates include `organizationId`
and exclude legacy null rows.

## POST-GO-LIVE.2.1C0 future organization-domain gate

Before any organization, membership, or invitation endpoint may be marked
Enforced, its 2.1C2 tests must prove: scoped organization and membership reads;
cross-tenant `404`; default-deny for every proposed capability; no OWNER grant;
last-OWNER protection for remove, suspend, downgrade, and leave; recipient
email/user binding; digest-only persistence and no token/email log output;
duplicate pending invitation rejection; double acceptance; accept/revoke race;
and serializable retries only for PostgreSQL serialization failures.

The 2.1C1 migration tests must additionally prove the active-invitation partial
unique index and the terminal-timestamp consistency constraint. Fixtures must
use synthetic identifiers and `example.test` email addresses only.

## POST-GO-LIVE.2.1C2 coverage

Organization path scope uses a required resolved context and membership reads
use sanitized projections. Invitation lifecycle mutations use serializable
transactions, conditional updates and the 2.1C1 partial pending key. The
implementation tests malformed tokens, cross-tenant paths, ADMIN-to-OWNER
denial and last-owner protection; integration certification remains required
against the local `_test` PostgreSQL database.
