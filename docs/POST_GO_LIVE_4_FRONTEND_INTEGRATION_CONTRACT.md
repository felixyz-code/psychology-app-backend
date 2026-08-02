# POST-GO-LIVE.4 — Frontend Integration Contract

## Formal status

```text
PHASE: POST-GO-LIVE.4 — SaaS User Experience
STATUS: CONTRACT DOCUMENTED
CODE IMPLEMENTATION: NOT STARTED
SCHEMA CHANGE: NOT AUTHORIZED
MIGRATIONS: NOT AUTHORIZED
PRODUCTION ROLLOUT: NOT AUTHORIZED
PRIMARY REPOSITORY: backend
SECONDARY REPOSITORY: frontend
READINESS TARGET: SAAS DEMO-READY
```

This document is the backend half of the paired contract with
`frontend/docs/POST_GO_LIVE_4_SAAS_UX_CONTRACT.md`. It defines the minimum
future backend contract needed by the frontend SaaS UX. It does not authorize
code, DTO, controller, service, Prisma, migration, seed, Postman, test,
workflow, infrastructure, or production changes.

## Repository baselines

The preflight was performed in the canonical repositories before branch
creation:

| Repository | Baseline branch | Baseline HEAD | Upstream | Ahead/behind | Working tree |
| --- | --- | --- | --- | --- | --- |
| frontend | `development` | `1e04dac1e762e0c020243dc18c6276eb764a008a` | `origin/development` | `0/0` | clean |
| backend | `development` | `f6bdea366251b34db760dc85edb69bd9e86e075a` | `origin/development` | `0/0` | clean |

The backend contract branch is
`codex/post-go-live-4-0-frontend-integration-contract`. The detached Codex
frontend worktree was dirty and was intentionally left untouched; it is not a
canonical baseline.

## Objective and authority boundaries

The objective is to specify the smallest compatible backend changes required
for tenant selection, context lifecycle, capabilities, memberships,
organization administration, invitations, ownership transfer, freelancer
signup, stable error handling, and concurrency-aware frontend behavior.

The backend remains final authority. JWTs remain identity-only. The validated
`X-Organization-Id` header remains request-time tenant authority. The persisted
`preferredOrganizationId` remains UX-only and never selects or authorizes a
tenant by itself. Cross-tenant failures remain redacted.

## Current evidence baseline

The current implementation and documentation were inspected before this
contract was written:

* `POST /auth/login` returns `accessToken` and a public user projection.
* `POST /auth/freelancer-bootstrap` creates one user, one active organization,
  and one active OWNER membership transactionally, then issues an
  identity-only JWT. It is feature-flagged and throttled.
* `GET /auth/context` accepts an optional `X-Organization-Id` header and
  currently returns `RESOLVED`, `UNRESOLVED`, or `LEGACY_COMPATIBILITY`.
* The current context response includes a validated `tenantContext` only for
  `RESOLVED`, selectable active memberships for unresolved/no-membership
  responses, and `preferredOrganizationId: uuid | null` after stale-value
  sanitization.
* Current selectable membership entries are
  `membershipId`, `organizationId`, `organizationDisplayName`, and
  `organizationRole`.
* `PUT /auth/context/preference` accepts `{ organizationId: uuid | null }`,
  validates active membership plus active organization for non-null values,
  and does not change JWT or request-time tenant authority.
* Organization routes already separate `GET /organizations`, current/detail,
  identity update, status, memberships, invitations, and ownership transfer.
* Invitation tokens are digested before persistence and returned only once in
  the permitted non-production response. Invitation lifecycle status is
  derived and token data is not listed.
* Membership mutations use role/status rules, historical `REVOKED` rows,
  serializable transactions, compare-and-set updates, and active-owner
  invariants.
* Current organization and membership DTOs do not provide the full stable
  error envelope below, and current membership list entries do not yet
  provide all proposed display fields. These are documented gaps, not
  implementation work in B2.

## Auth context contract

### Current response: `GET /auth/context`

Bearer authentication is required and tenant resolution is optional. The
header, when supplied, is validated by the tenant resolver. The current
response variants are:

```json
{
  "status": "RESOLVED",
  "tenantContext": {
    "userId": "uuid",
    "organizationId": "uuid",
    "membershipId": "uuid",
    "organizationRole": "OWNER | ADMIN | ...",
    "legacyUserRole": "...",
    "resolutionMode": "EXPLICIT | SINGLE_MEMBERSHIP"
  },
  "preferredOrganizationId": "uuid | null"
}
```

Without a resolved header/single membership, the current response is:

```json
{
  "status": "UNRESOLVED",
  "selectableMemberships": [
    {
      "membershipId": "uuid",
      "organizationId": "uuid",
      "organizationDisplayName": "Consultorio Norte",
      "organizationRole": "PSYCHOLOGIST"
    }
  ],
  "preferredOrganizationId": "uuid | null"
}
```

When there are no membership rows in the current query, the current
compatibility response is `LEGACY_COMPATIBILITY` with an empty
`selectableMemberships` array and the same nullable preference field. The
implementation must not invent fields in the current API.

Current behavior matrix:

| Request | Current result |
| --- | --- |
| Valid JWT, no header, exactly one eligible active membership | `RESOLVED`; `SINGLE_MEMBERSHIP` |
| Valid JWT, no header, multiple eligible memberships | `UNRESOLVED` with selectable active memberships |
| Valid JWT, no header, zero membership rows | `LEGACY_COMPATIBILITY` with empty list |
| Valid JWT, no header, only suspended/ineligible rows | Context does not resolve; required tenant routes fail closed |
| Valid JWT, valid eligible header | `RESOLVED`; `EXPLICIT` |
| Valid JWT, malformed/repeated header | `400` |
| Valid JWT, ineligible header | Redacted `403` |
| Valid JWT, stale preferred organization | Preference is returned as `null`; it never resolves context |
| Invalid/missing JWT | `401` |

### Future proposed response

The future response should remain backward-compatible at the top level while
adding explicit projections required by frontend UX. Exact DTO names are open
until implementation review, but the semantics are fixed:

```json
{
  "status": "RESOLVED | UNRESOLVED | NO_ACTIVE_MEMBERSHIPS | ADMIN_SUSPENDED_CONTEXT",
  "tenantContext": {
    "userId": "uuid",
    "organizationId": "uuid",
    "membershipId": "uuid",
    "organizationRole": "OWNER",
    "resolutionMode": "EXPLICIT | SINGLE_MEMBERSHIP"
  },
  "organization": {
    "id": "uuid",
    "displayName": "string",
    "status": "ACTIVE | SUSPENDED"
  },
  "membership": {
    "id": "uuid",
    "userId": "uuid",
    "displayName": "string | null",
    "email": "string",
    "role": "OWNER",
    "status": "ACTIVE",
    "createdAt": "date-time",
    "updatedAt": "date-time",
    "isCurrentUser": true
  },
  "capabilities": ["organization.read", "..."],
  "selectableMemberships": [],
  "preferredOrganizationId": "uuid | null"
}
```

The proposed shape may use separate variant DTOs, but it must preserve the
following behavior:

* no header with one active eligible organization may resolve automatically;
* no header with multiple active eligible organizations returns selectable
  active membership projections and no fabricated active tenant;
* a valid header resolves only after active membership and organization checks;
* zero active memberships is explicit and distinguishable from a suspended
  administrative context;
* a suspended organization can be returned only as an explicit administrative
  context and never as an operational tenant;
* capabilities are calculated server-side for the resolved request context;
* preferred organization is returned only when still eligible, otherwise null;
* membership and capability data refresh after role/status/ownership changes;
* the response does not cause JWT reissuance or add tenant claims.

### Context state semantics

The frontend may map these server results into its own store states, but the
backend response must preserve these distinctions:

```text
ACTIVE_TENANT_READY
ADMIN_SUSPENDED_CONTEXT
NO_ACTIVE_TENANT
AMBIGUOUS_SELECTION
FORBIDDEN
```

`SUSPENDED` is not an active tenant state. Normal tenant-aware clinical,
financial, scheduling, and report data must remain blocked for a suspended
organization. Administrative identity/status/membership context is separately
specified below.

## Capabilities projection — REQUIRED

The frontend needs a server-computed UX projection so it can use
`can(capability)` without copying the complete authorization matrix. This is a
`REQUIRED` response contract change, not a JWT change.

* Location: resolved context response, and any endpoint explicitly returning a
  refreshed context after a mutation. A contextless response returns an empty
  array or an explicitly documented absence; it must not imply permissions.
* Type: JSON array of strings from the closed `OrganizationCapability` catalog.
* Order: deterministic lexical order unless an OpenAPI enum order is formally
  chosen; the frontend must not rely on order.
* Uniqueness: no duplicates; unknown values are rejected at the server
  projection boundary and treated as absent by clients.
* Active tenant: capabilities are derived from current role, membership,
  organization, assignments, and policy; role alone is not a clinical grant.
* Suspended context: only capabilities explicitly allowed for administrative
  suspended context may appear; operational capabilities are absent.
* No selected tenant: return no active-tenant capabilities.
* Updates: role, membership status, organization status, and ownership changes
  take effect on the next request with the same JWT.
* Security: the projection is advisory UX metadata. Every protected endpoint
  re-evaluates authorization and tenant predicates.
* Compatibility: add the field compatibly where possible; preserve current
  fields during migration; document whether an absent field means legacy
  server or empty capabilities during rollout.
* Consumer: frontend store exposes `can(capability)` and never reconstructs
  the full role matrix.

The closed catalog includes organization, membership, invitation, ownership,
patient, case file, workspace, session note, document, appointment, finance,
report, and audit capabilities already defined by the approved matrix. This
contract does not add a new capability name.

## Membership projection — REQUIRED

The current membership list is sanitized but does not yet provide the stable
minimum projection needed for search, filters, user recognition, and privacy-
aware administration. The future minimum is:

| Field | Type | Contract |
| --- | --- | --- |
| `id` | UUID | Membership identifier |
| `userId` | UUID | Stable user reference; expose only where authorized |
| `displayName` | string or null | Presentation name; null when no usable name exists |
| `email` | string | Canonical identity for matching; expose only to authorized admins |
| `role` | enum | `OWNER` is the only owner marker |
| `status` | enum | `INVITED`, `ACTIVE`, `SUSPENDED`; historical `REVOKED` remains omitted from current list |
| `createdAt` | date-time | Creation timestamp |
| `updatedAt` | date-time | Last projection-relevant update timestamp |
| `isCurrentUser` | boolean | Server-derived comparison to authenticated user |

Rules:

* Do not add a separate owner marker, invitation origin, or unnecessary
  personal data. `OWNER` is derived from `role === OWNER`.
* Privacy is least-privilege: only membership readers receive this projection;
  no cross-tenant or unauthorized user data is included.
* Sort deterministically, preferably by current API order with an explicit
  documented secondary key. Clients must not infer business meaning from
  order.
* Backend filters by role/status only from server data; frontend filters are
  presentation aids.
* When a user has no name, return `displayName: null` and keep email separate.
* `email` is canonical identity data; `displayName` is presentation data. Do
  not replace one with the other.
* Redact or omit the entire projection when the caller lacks `membership.read`.
* A revoked historical row is not reactivated in place and is not projected by
  the current administrative list.

## Error envelope — REQUIRED

Future API errors must converge on this base shape:

```json
{
  "statusCode": 409,
  "code": "CONCURRENT_UPDATE",
  "message": "The resource changed. Refresh and try again.",
  "requestId": "opaque-request-id",
  "details": null
}
```

Required semantics:

* `statusCode` is the actual HTTP status and must agree with the response.
* `code` is a stable machine-readable enum; frontend behavior never parses
  `message`.
* `message` is safe, short, and non-sensitive human guidance.
* `requestId` is the response/request correlation ID, using the existing
  request-ID middleware semantics.
* `details` is optional, typed per code, and may be `null`; it never contains
  stack traces, JWTs, invitation tokens, clinical data, another tenant's
  existence, or unnecessary PII.
* Validation errors may include field-safe details; all details are still
  redacted and bounded.
* A future NestJS exception filter/interceptor should normalize framework and
  Prisma exceptions without changing authorization redaction.
* Existing clients need a compatibility period for `{ statusCode, message }`
  responses. The migration plan must make `code` and `requestId` additive before
  removing legacy interpretation.

## Error codes and frontend policy

| Code | HTTP | Scenario | Redaction | Retry policy | Frontend consumer |
| --- | ---: | --- | --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Invalid body/header/field | Safe field details only | User correction | Field/form errors |
| `UNAUTHENTICATED` | 401 | Missing/invalid JWT | No identity disclosure | Re-authenticate | Clear auth and login |
| `FORBIDDEN` | 403 | Authenticated but not permitted | Do not reveal protected resource | No automatic retry | Forbidden/recovery |
| `TENANT_CONTEXT_REQUIRED` | 409 | Selection absent/ambiguous for required route | No tenant enumeration | Select explicitly | Context selector |
| `RESOURCE_NOT_FOUND` | 404 | Missing or cross-tenant resource | Redacted | No blind retry | Not-found state |
| `CONFLICT` | 409 | Invalid state transition or invariant | Safe guidance | Refresh before user retry | Conflict dialog |
| `CONCURRENT_UPDATE` | 409 | Compare-and-set/transaction race | Safe guidance | Refresh and deliberate retry | Reload resource/context |
| `CAPABILITY_DENIED` | 403 | Capability absent | No policy disclosure beyond safe code | No automatic retry | Hide/disable plus feedback |
| `INVITATION_TERMINAL` | 409 | Accept/reject/revoke/resend terminal state | No token or recipient leakage | Reload invitation | Terminal-state UX |
| `INVITATION_RECIPIENT_MISMATCH` | 403 | Authenticated user is not recipient | Do not reveal recipient existence | No automatic retry | Mismatch/re-auth choice |
| `RATE_LIMITED` | 429 | Signup/throttle limit | Safe retry guidance | User-controlled backoff | Throttle message |
| `UNEXPECTED_ERROR` | 5xx | Unclassified server failure | Generic only | Carefully user-controlled | Generic error/request ID |

The backend may retain internal exception reasons, but it must map externally
to this catalog or an approved later extension. No undocumented code is added
in this phase.

## Suspended organization semantics

Suspension is administrative visibility, not an operational tenant mode.

* Normal clinical, documents, appointments, finance, reports, and other
  operational tenant endpoints fail closed when the organization is suspended.
* `GET /organizations`, organization identity/status reads, and explicitly
  allowed administration context may remain available for a caller with a
  valid active membership and appropriate capability.
* `GET /organizations/current` and detail routes may opt into `ACTIVE` or
  `SUSPENDED` resolution for administrative display, but the response must
  identify the suspended state explicitly.
* Context projection for a suspended organization returns only administrative
  capabilities; it must not populate an active operational tenant shell.
* The frontend obtains this context through the same validated header and
  membership lookup, never from a body/path organization ID alone.
* Ownership transfer on a suspended organization remains fail-closed and
  returns a deterministic conflict according to the current runtime rule.
* Reactivation is an OWNER-controlled status mutation and must refresh context
  and capabilities before normal data loads.

## Endpoint matrix

The matrix below records the current route family and the frontend contract.
Exact response DTO names may be finalized during the implementation review.

| Method | Route | Header | DTO/request | Response projection | Capability | Key errors/concurrency | Frontend consumer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/auth/login` | No | login DTO | access token + user | Public | 400/401 | AuthStore |
| POST | `/auth/freelancer-bootstrap` | No | email/password/name/org | token + user + active org + OWNER membership | Public flag/throttle | 400/409/429/5xx | Signup flow |
| GET | `/auth/context` | Optional validated | none | Context variant + preference; future capabilities/membership | Identity; tenant optional | 400/401/403 | TenantContextStore |
| PUT | `/auth/context/preference` | No | `{ organizationId: uuid|null }` | preference | Identity only | 400/401/404/409 | Preference UX |
| GET | `/organizations` | No | none | Accessible active-membership organizations; admin discoverability | Identity | 401 | Selection/admin shell |
| GET | `/organizations/current` | Required | none | Current org metadata | `organization.read` | 401/403/404 | Organization shell |
| GET | `/organizations/:id` | Required | path ID must match header | Organization metadata | `organization.read` | Redacted 404 | Organization detail |
| PATCH | `/organizations/:id` | Required | editable identity fields | Refreshed org | `organization.manage` | 400/403/409 CAS | Organization admin |
| PATCH | `/organizations/:id/status` | Required | ACTIVE/SUSPENDED | Refreshed org | `organization.manage` | 403/409 transition/CAS | Suspended/admin UX |
| GET | `/organizations/:id/memberships` | Required | none | Minimum membership projection | `membership.read` | 403/404 | Membership admin |
| PATCH | `/organizations/:id/memberships/:mid/role` | Required | non-OWNER role | Refreshed membership/context as needed | `membership.manage_role` | 403/404/409 CAS/invariant | Membership admin |
| PATCH | `/organizations/:id/memberships/:mid/status` | Required | ACTIVE/SUSPENDED | Refreshed membership/context as needed | suspend/reactivate | 403/404/409 CAS | Membership admin |
| DELETE | `/organizations/:id/memberships/:mid` | Required | none | Revoked result | `membership.remove` | 403/404/409 owner/CAS | Membership admin |
| POST | `/organizations/:id/memberships/leave` | Required | none | Revoked result | `membership.leave` | 403/409 last OWNER/CAS | Membership UX |
| GET | `/organizations/:id/invitations` | Required | none | Sanitized lifecycle list | `invitation.read` | 403/404 | Invitation admin |
| POST | `/organizations/:id/invitations` | Required | recipient email + role | Sanitized invitation, token only where allowed once | `invitation.create` | 400/403/409 | Invitation admin |
| POST | `/organizations/:id/invitations/:iid/revoke` | Required | none | terminal invitation | `invitation.revoke` | 403/404/409 terminal | Invitation admin |
| POST | `/organizations/:id/invitations/:iid/resend` | Required | none | replacement invitation | `invitation.resend` | 403/404/409 terminal | Invitation admin |
| POST | `/organization-invitations/:token/accept` | No tenant header | token path + JWT | membership/context refresh | Recipient identity | 401/403/404/409 terminal | Invitation acceptance |
| POST | `/organization-invitations/:token/reject` | No tenant header | token path + JWT | terminal result | Recipient identity | 401/403/404/409 terminal | Invitation acceptance |
| POST | `/organizations/:id/ownership-transfer` | Required | target membership ID | source/target membership + timestamp | `ownership.transfer` | 403/404/409 owner/target/CAS | Ownership UX |
| tenant-aware | Clinical endpoints | Required | Existing module DTOs | Tenant-scoped projections | Domain capability + assignment | Redacted 404/403/409 | Clinical stores |

`GET /organizations` is intentionally identity-only and may show suspended
organizations for administrative discoverability. A list entry never
authorizes a tenant request; the frontend must still select and validate the
header.

## Change classification

| Change | Classification | Evidence | Compatibility | Tests | OpenAPI | Seed | Postman | Migration |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Add server-computed `capabilities` projection | REQUIRED | Frontend needs `can`; current DTO has none | Additive field; preserve current variants during transition | Unit/service/controller/PostgreSQL E2E | Update schemas | Add multi-role/suspended cases if needed | Add context assertions later | None expected |
| Add minimum membership projection fields | REQUIRED | Current list lacks display identity/current-user marker | Additive sanitized fields | Privacy/authorization/concurrency E2E | Update schemas | Existing fixtures sufficient; evaluate null-name case | Add list/filter assertions later | None expected |
| Stable error envelope and codes | REQUIRED | Current Prisma filter returns status/message only | Additive compatibility adapter first | Filter/controller/E2E | Define error schemas | No schema seed | Reconcile assertions | None expected |
| Explicit suspended admin-context projection | REQUIRED | Frontend must distinguish suspended from active | Variant/additive status semantics | Guard/service/E2E | Document variants | Suspended fixture exists | Add selected scenarios later | None expected |
| Context refresh after mutating role/status/ownership | REQUIRED | Same JWT remains valid while request authority changes | Reuse JWT; refresh context | Concurrency E2E | Document response | Existing ownership/suspension fixtures | Add flow assertions later | None expected |
| Deterministic endpoint capability/error documentation | REQUIRED | Cross-repository implementation contract | Documentation additive | Contract tests | OpenAPI review | N/A | N/A | N/A |
| Request generation/idempotency token for reads | OPTIONAL | Frontend generation is client-side; backend need not persist it | No API dependency unless later chosen | Only if introduced | Only if introduced | No | No | No |
| Invitation email delivery | REJECTED | Explicitly outside B2/Phase 4 | N/A | N/A | N/A | N/A | N/A | N/A |
| Tenant claims in JWT | REJECTED | Violates identity-only authority model | N/A | N/A | N/A | N/A | N/A | N/A |
| New schema without evidence | REJECTED | No approved data requirement | N/A | N/A | N/A | N/A | N/A | N/A |
| B2 migrations or production rollout | REJECTED | Gate is documentation-only | N/A | N/A | N/A | N/A | N/A | N/A |

## Required implementation testing obligations

Each future `REQUIRED` change must include unit tests, service tests,
controller tests, PostgreSQL E2E, and concurrency E2E where the change has a
compare-and-set or transaction race. It must also update OpenAPI schemas,
evaluate seed fixtures, run `seed:certify`, exercise the approved Postman
flows, and update documentation. Cross-tenant redaction, same-JWT context
refresh, suspended context, stale preference, ownership transfer, membership
terminal states, and invitation one-shot behavior are explicit certification
cases.

## Postman reconciliation

The versioned collection is not modified by this contract. The evidence in
`docs/DEVELOPMENT_SEED_AND_POSTMAN.md` and the Phase 3 closeout distinguishes
the following numbers:

```text
collection total requests: 93
runner-selected requests: 25
executed requests: 25
assertions: 19
```

The apparent discrepancy is intentional: the collection contains 14 folders
and the full 93-request catalog, while the certified local runner selects the
focused Phase 3/tenant-context flow rather than executing every catalog item.
That selected flow executes 25 requests and records 19 assertions. The
collection contains the broader auth, organization, membership, invitation,
ownership, clinical, finance, and reporting request families. These counts are
not to be “corrected” without new evidence. Future Phase 4 additions must
declare whether a request is collection-only, runner-selected, executed, and
asserted.

## Explicit rejections

This contract rejects:

* tenant, organization, membership, capability, or preference claims in JWT;
* trusting `organizationId` from a DTO/body/query/path as tenant authority;
* using preferred organization as authority;
* a new schema or migration without evidence and separate authorization;
* migrations, seed changes, Postman collection/runner changes, or code in B2;
* invitation email delivery or a transactional email provider;
* branding, themes, clinical redesign, or account-security expansion;
* infrastructure, TLS, domain, WAF, backup, alerting, or production changes.

## Cross-Repository Contract References

The paired frontend contract is:

```text
frontend repository:
docs/POST_GO_LIVE_4_SAAS_UX_CONTRACT.md
```

This backend contract is:

```text
backend repository:
docs/POST_GO_LIVE_4_FRONTEND_INTEGRATION_CONTRACT.md
```

Shared terminology is mandatory: identity-only JWT, validated
`X-Organization-Id`, UX-only preferred organization, role-based ownership,
redacted cross-tenant errors, active operational tenant, suspended
administrative context, capabilities, membership projection, generation-based
frontend invalidation, and the stable error envelope.

## Phase 4 subphases and gates

The backend integration work follows the frontend subphases without authorizing
implementation in this gate:

| Subphase | Backend contract objective | Main evidence/gate |
| --- | --- | --- |
| 4.0 | Pair terminology and DTO/error boundaries | Independent contract review |
| 4.1 | Support confirmed tenant context lifecycle | Context/OpenAPI/guard certification |
| 4.2 | Preserve selection/preference independence | Same-JWT preference and stale tests |
| 4.3 | Support safe invalidation signals | Tenant mutation/context refresh tests |
| 4.4 | Organization identity/status responses | Suspended admin semantics certified |
| 4.5 | Membership projection and mutations | Privacy, owner invariant, concurrency |
| 4.6 | Invitation terminal/deep-link contract | One-shot, recipient, token-safety tests |
| 4.7 | Ownership transfer response/conflicts | Transaction and immediate authority refresh |
| 4.8 | Freelancer bootstrap response/errors | Flag, throttle, 400/409/429 certification |
| 4.9 | Stable authorization/error envelope | Filter, OpenAPI, redaction certification |
| 4.10 | Cross-tenant backend certification | PostgreSQL, seed, Postman, E2E |
| 4.11 | Closeout | Independent review and phase closeout |

## Findings, risks, and next gate

* `capabilities` is a `REQUIRED` additive projection gap.
* The proposed membership projection is a `REQUIRED` additive projection gap;
  it must remain privacy-minimized and must not introduce a separate owner
  marker.
* The stable error envelope is a `REQUIRED` compatibility gap; current
  framework/Prisma error responses must be migrated without weakening
  redaction.
* Suspended organization handling is a high-risk semantic boundary because
  current organization routes can resolve suspended state for administration;
  later implementation must ensure the frontend never treats it as an active
  operational tenant.
* The frontend generation protocol is client-side coordination; it does not
  require a backend persistence column in this contract.

These are implementation-ready findings, not authorization to implement them.

```text
NEXT GATE: NEXT-PHASE-B2-R1 — Independent Contract Review
IMPLEMENTATION: NOT AUTHORIZED
READY: NO
MERGE: NO
```
