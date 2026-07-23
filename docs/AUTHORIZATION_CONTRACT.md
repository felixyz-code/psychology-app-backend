# Authorization Contract

## Status and authority

This is the primary source of truth for POST-GO-LIVE.2.1 authorization. Future implementation changes must update this document and `TENANT_ENDPOINT_SCOPE_MATRIX.md` together.

## Concepts

| Concept | Authority | Meaning |
| --- | --- | --- |
| Identity | JWT `sub`, then current `User` read | Who made the request |
| Legacy global role | `User.role` | `ADMIN`/`PSYCHOLOGIST`; compatibility only |
| Membership | `OrganizationMembership` | Active user relation and role in one organization |
| Tenant context | Per-request server validation | Selected active organization plus membership |
| Capability | Capability matrix | Explicit permission derived from organizational role |
| Ownership | Resource policy | Legacy psychologist ownership during transition |
| Assignment | `PatientAssignment` | Fine clinical condition; never membership replacement |

No client-supplied `organizationId` has authorization meaning. A platform administrator does not currently exist. A future platform role requires a separate model, protocol, recorded reason, and security audit; it is not implied by legacy `ADMIN`.

## Authorization pipeline

`JWT authentication → user lookup → tenant resolution → capability policy → tenant-aware repository → ownership/assignment policy → audit event`

Tenant resolution requires active membership and active organization. Policy checks apply after resolved context. Organizational role never overrides tenant scope; owner/admin authority is confined to the selected organization.

## Role and capability policy

Roles receive only capabilities expressly granted in `AUTHORIZATION_CAPABILITY_MATRIX.md`. An `OWNER` alone performs owner-only actions. `ADMIN` is not an owner substitute. `READ_ONLY` and `AUDITOR` never receive write capabilities. Names of roles imply no unstated permission.

## Resource and legacy rules

Tenant-owned resources belong to `organizationId`. Patient is the clinical root; case files, notes, documents, appointments, and patient-linked finance agree with that tenant. Finance without a patient or appointment is still organization-scoped. During conversion, `psychologistId` is an additional restriction only and never broadens tenant scope.

`organizationId = null` is a legacy state, not a virtual tenant. It is not visible through enforced tenant routes and must be measured in Shadow mode. It becomes visible only after verified mapping/backfill, never through `OR organizationId IS NULL`.

## HTTP and anti-enumeration

| Condition | Response |
| --- | --- |
| Missing, invalid, or expired JWT | `401` |
| Invalid or repeated organization header | `400` |
| Foreign, missing, inactive, suspended, or revoked selection | Redacted `403` |
| Required route, multiple eligible organizations, no selection | `409` |
| Required route, no eligible membership | `403` |
| Valid tenant but inaccessible resource/relationship/ID | `404` |
| Two visible but incompatible relation IDs | `400` |
| Capability denied for visible in-tenant action | `403` |

An `INVITED`, `SUSPENDED`, or `REVOKED` membership cannot establish context. An inactive organization invalidates all membership contexts. Responses never reveal a foreign resource or organization exists.

## Audit and rollout

Sensitive operations eventually record actor user, organization, membership, capability, technical resource ID/type, result, request ID, and approved reason where required. Logs/audit events never contain notes, document content, names, emails, passwords, JWTs, headers, or file paths.

`Disabled` retains legacy behavior. `Shadow` resolves and compares scope without denying, logging only sanitized discrepancy metadata. `Enforced` requires context, capability, scope, and relationship validation. A module moves to Enforced only after endpoint-matrix rows and security-test contract pass.
