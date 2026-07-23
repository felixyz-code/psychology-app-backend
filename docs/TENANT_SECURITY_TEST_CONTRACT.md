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
