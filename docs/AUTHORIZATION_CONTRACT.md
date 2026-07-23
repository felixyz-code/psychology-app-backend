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

## POST-GO-LIVE.2.1C0 invitation and membership lifecycle proposal

This proposal resolves the missing contract but is **not approved runtime
behavior**. The current typed catalog remains closed and default-deny until the
human decisions listed below are approved and 2.1C1 has introduced the required
schema safely.

### Distinct operations

* **Revoke invitation** is an authorized tenant-administration action.
* **Reject invitation** is a decision by the authenticated recipient.
* **Expire invitation** is a time-derived outcome once `expiresAt <= now()`.
* **Remove membership** is an OWNER-only administrative mutation of another
  membership; it ends tenant eligibility immediately without deleting the row.
* **Leave organization** is a self-only action. It is not an administrative
  remove endpoint and may not leave the organization with zero active OWNERS.

An active organization must retain at least one `ACTIVE` OWNER. No actor may
remove, suspend, downgrade, or self-leave as the last active OWNER. Ownership
transfer, if approved for this MVP, is an explicit, serializable operation; it
is never implicit in a role-change or remove request.

Removal and leave are non-idempotent state transitions: a target that is
already terminal returns `409`. They retain historical assignments rather than
deleting clinical links; a future assignment policy must treat an inactive
membership as ineligible. Existing requests are not force-terminated, but the
next tenant-context resolution fails and no new tenant-scoped action is
authorized.

### Proposed invitation identity and lifecycle

The recommended persistence model is hybrid: required `normalizedEmail`,
optional `invitedUserId`, and `acceptedByUserId`. Acceptance requires the
authenticated user's normalized, verified email to match; when `invitedUserId`
is present it must match too. A changed email invalidates eligibility rather
than silently rebinding an invitation. Plain tokens are generated from a
cryptographic source, shown only once where an approved local/test delivery
flow needs them, and persisted solely as a SHA-256 digest.

The recommended lifecycle is timestamp-based: `acceptedAt`, `rejectedAt`,
`revokedAt`, and `expiredAt` are mutually exclusive terminal timestamps. An
expired invitation is derived while read-only, and materialized as `expiredAt`
inside the next serializable lifecycle/create transaction that encounters it.
This preserves the meaningful distinction between recipient rejection,
administrative revocation, and time-based expiry without a background job. A
PENDING invitation has no terminal timestamp. Before creating an equivalent
invitation, the transaction materializes eligible expired rows, then relies on
the partial unique index for rows with no terminal timestamp.

### HTTP and anti-enumeration proposal

Malformed DTOs or tokens return `400`; tenant-visible but unauthorized actions
return `403`; foreign tenant resources return `404`; unknown invitation tokens
return a stable redacted `404`; duplicate pending invitations, terminal-token
reuse, invalid state transitions, existing memberships, last-OWNER attempts,
and serialization conflicts return `409`. Responses never disclose email,
token, digest, or a foreign organization identifier.

### Required product decisions

The following retain `REQUIRES_PRODUCT_DECISION` and block 2.1C2 API work:

1. ADMIN invitation creation and revocation authority.
2. Whether an AUDITOR may see member identity or invitation metadata.
3. Whether an existing recipient may be re-invited after rejecting.
4. The invitation lifetime (the conservative proposed default is 7 days).
5. Whether ownership transfer belongs in the MVP.
6. Whether any email delivery exists in the MVP (default: no real delivery).

### Human-decision register

| Decision | Conservative proposed default | Classification |
| --- | --- | --- |
| Can ADMIN invite? | No until explicitly approved. | BLOCKS_ROLE_MATRIX |
| Can ADMIN suspend/remove another ADMIN? | No; ADMIN may not mutate peers or OWNER. | BLOCKS_ROLE_MATRIX |
| Can PSYCHOLOGIST invite? | No. | BLOCKS_ROLE_MATRIX |
| Can BILLING or RECEPTIONIST list memberships? | No. | BLOCKS_ROLE_MATRIX |
| Can AUDITOR view member identity? | No; only no member-list endpoint until approved. | BLOCKS_ROLE_MATRIX |
| Must rejection persist? | Yes, as `rejectedAt`. | BLOCKS_SCHEMA |
| Can a recipient be re-invited after rejection? | Not automatically; require an explicit future decision. | BLOCKS_API |
| Default invitation duration | Seven days. | BLOCKS_SCHEMA |
| Is ownership transfer in the MVP? | No; omit the endpoint. | BLOCKS_API |
| Does MVP notify by email? | No real email delivery; local/test artifact only if separately approved. | NON_BLOCKING |

`membership.remove` is proposed OWNER-only; every active member may invoke
only self-leave. These are documented proposals, not an authorization change.
