# POST-GO-LIVE.3.0 Organization & Membership Administration Contract

## Status

POST-GO-LIVE.3.0 is a documentation-only phase for:

- architectural audit;
- gap analysis;
- normative contract design;
- future rollout planning.

This contract is now merged on `development` through PR `#35` at merge commit
`7d897ec8db2c5d372fce0b4dc0eaf3bd3b1d4b13`.

It is closed as a specification baseline only. It does not mean that
organization administration runtime, membership history schema changes,
invitation resend, or organization switching UX are already implemented.

The next eligible phase is `POST-GO-LIVE.3.1 - Organization Administration
Runtime`, which remains not started at the time of this closeout.

It does not implement runtime behavior, Prisma schema changes, migrations,
frontend behavior, infrastructure work, production access, deployment, or
backfill.

## Scope and baseline

Authorized repository baseline:

- branch: `development`
- authorized HEAD: `51206bd4fa362ff1ab12e4d844bbef8bbc3f546e`
- runtime tenant platform baseline: D0 through D5 integrated
- tooling baseline: POST-GO-LIVE.2.2 integrated

Expected Prisma and migration baseline:

- Prisma CLI: `7.8.0`
- `@prisma/client`: `7.8.0`
- real migrations: `4`
- expected migration names:
  - `20260715090000_baseline_current_schema`
  - `20260715090100_add_persistence_checks`
  - `20260717120000_add_saas_foundation`
  - `20260723120000_add_invitation_membership_lifecycle`

## Boundary

This contract must preserve the current tenant-aware security posture:

`JWT -> validated tenant selection -> active membership -> active organization -> explicit capability -> assignment when clinical content applies -> tenant-scoped persistence -> sanitized response`

Nothing in POST-GO-LIVE.3.0 weakens:

- `organizationId` as primary boundary;
- redacted `404` for cross-tenant direct resources;
- server-owned tenant fields;
- no global clinical bypass for `OWNER` or `ADMIN`;
- no capability bypass for assignment;
- no client-owned active tenant.

## Audit of the current backend state

### Organization

Current Prisma model:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Primary key |
| `slug` | `varchar(100)` | Unique |
| `legalName` | `varchar(255)` | Required |
| `displayName` | `varchar(150)` | Required |
| `status` | `OrganizationStatus` | Default `PROVISIONING` |
| `timezone` | `varchar(100)` | Default `UTC` |
| `locale` | `varchar(20)` | Default `es-MX` |
| `currency` | `char(3)` | Default `MXN` |
| `createdAt` | timestamptz | Server-owned |
| `updatedAt` | timestamptz | Server-owned |

Current enum values:

- `PROVISIONING`
- `ACTIVE`
- `SUSPENDED`
- `ARCHIVED`

Current relations:

- `memberships`
- `invitations`
- `settings`
- `branding`
- tenant-owned clinical and financial resources
- `assignments`

Current persistence constraints and behavior:

- `slug` is unique
- tenant-owned clinical and financial tables hold nullable `organizationId`
- `OrganizationSettings` and `OrganizationBranding` cascade on delete
- clinical and financial tenant foreign keys use `RESTRICT`
- current schema already reserves lifecycle states beyond current runtime usage

Current runtime behavior:

- implemented read endpoints:
  - `GET /organizations`
  - `GET /organizations/current`
  - `GET /organizations/:organizationId`
- current read projection is intentionally narrow:
  - `id`
  - `displayName`
  - `status`
  - `timezone`
  - `locale`
  - `currency`
- current reads require the selected tenant for scoped routes and `ACTIVE`
  organization state
- there is no public runtime endpoint for:
  - organization creation
  - organization update
  - organization suspension
  - organization reactivation
  - organization archival
  - organization deletion

Interpretation of the current state:

- `Organization` already represents a real tenant boundary, not a placeholder
  entity
- the identity model is richer than the current API surface
- lifecycle states exist in the schema, but only `ACTIVE` and `SUSPENDED` have
  clear runtime consequences through tenant resolution
- `PROVISIONING` and `ARCHIVED` exist structurally but have no public
  administration flow
- ownership is not stored on `Organization`; it is inferred through
  `OrganizationMembership.role = OWNER`

What is missing for 3.1 implementation:

- organization create flow
- editable identity contract
- explicit lifecycle mutations
- owner-safe organization suspension semantics
- archive semantics
- deletion posture
- audit and optimistic concurrency posture

### Membership

Current Prisma model: `OrganizationMembership`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Primary key |
| `organizationId` | UUID | FK to `Organization` |
| `userId` | UUID | FK to `User` |
| `role` | `MembershipRole` | One role only |
| `status` | `MembershipStatus` | Default `INVITED` |
| `joinedAt` | timestamptz nullable | Used for active memberships |
| `suspendedAt` | timestamptz nullable | Used for suspensions |
| `revokedAt` | timestamptz nullable | Used for terminal removal/leave |
| `createdAt` | timestamptz | Server-owned |
| `updatedAt` | timestamptz | Server-owned |

Current enum values:

- roles:
  - `OWNER`
  - `ADMIN`
  - `PSYCHOLOGIST`
  - `RECEPTIONIST`
  - `BILLING`
  - `AUDITOR`
  - `READ_ONLY`
- statuses:
  - `INVITED`
  - `ACTIVE`
  - `SUSPENDED`
  - `REVOKED`

Current constraints:

- unique `(organizationId, userId)`
- index `(organizationId, status, role)`
- index `(userId, status)`

Current runtime behavior:

- implemented endpoints:
  - `GET /organizations/:organizationId/memberships`
  - `PATCH /organizations/:organizationId/memberships/:membershipId/role`
  - `PATCH /organizations/:organizationId/memberships/:membershipId/status`
  - `DELETE /organizations/:organizationId/memberships/:membershipId`
  - `POST /organizations/:organizationId/memberships/leave`
- runtime policy today:
  - ADMIN can mutate only non-OWNER memberships
  - ADMIN cannot mutate self
  - ADMIN cannot grant a role above ADMIN
  - generic role change cannot assign `OWNER`
  - suspension/reactivation only operate between `ACTIVE` and `SUSPENDED`
  - terminal `REVOKED` memberships cannot reactivate
  - removal and self-leave both end in `REVOKED`
  - last active OWNER cannot be suspended, removed, or leave
- serializable transaction helper retries write conflicts up to three times

Current ambiguities and gaps:

- `INVITED` exists in the enum but the current invitation runtime does not
  create membership rows at invite time
- `REVOKED` currently carries several meanings:
  - administrative removal
  - voluntary leave
  - generic terminal membership state
- there is no distinct persisted reason for:
  - removed
  - left voluntarily
  - ownership downgrade
  - security-driven termination
- because of the unique `(organizationId, userId)` key, a fully terminal
  historical membership row currently blocks creating a brand new membership row
  for the same user and organization

Current conclusion:

- the runtime already implements meaningful membership administration
- the schema is sufficient for basic remove/suspend/reactivate flows
- the schema is not yet ideal for full historical lifecycle semantics

### User

Current Prisma model: `User`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Primary key |
| `name` | `varchar(150)` | Required |
| `email` | `varchar(255)` | Unique |
| `passwordHash` | mapped to `password` | Required |
| `role` | `UserRole` | Legacy global role |
| `createdAt` | datetime | Server-owned |
| `updatedAt` | datetime | Server-owned |

Current related tenant-aware entities:

- `memberships`
- `invitedOrganizationInvitations`
- `acceptedOrganizationInvitations`
- `psychologistProfile`

Current auth and lifecycle reality:

- public auth route: `POST /auth/login`
- authenticated context route: `GET /auth/context`
- there is no public runtime route for:
  - registration
  - signup
  - refresh token rotation
  - logout
  - user suspension
  - user deactivation
- JWT payload contains:
  - `sub`
  - `name`
  - `email`
  - `role`
- JWT does not contain:
  - `organizationId`
  - `membershipId`
  - `organizationRole`
  - capabilities

Current structural conclusions:

- a user is no longer structurally equal to one organization
- a user is no longer structurally equal to one membership
- a user is not structurally equal to one organizational role
- legacy `User.role` still exists and still matters for login-compatible
  behavior and transitional clinical restrictions

Remaining assumptions still visible in code and docs:

- some older architectural narrative still describes only legacy `ADMIN` and
  `PSYCHOLOGIST`
- email canonicalization is invitation-aware in `OrganizationInvitation`, but
  `User` itself still stores only one unique email string and login uses exact
  equality

### Current freelancer creation flow

There is no public runtime freelancer registration flow in the current backend.

What exists today:

- tenant-aware development seed creates:
  - organizations
  - users
  - memberships
  - assignments
- legacy backfill command can create one explicit legacy organization and
  memberships from an operational manifest
- tenant-aware patient creation supports the already-provisioned freelancer
  `OWNER` flow inside an active organization

What does not exist today:

- public `POST /auth/register`
- public `POST /organizations`
- public bootstrap endpoint that atomically creates:
  - user
  - organization
  - owner membership
  - initial active organization selection

Current conclusion:

- freelancer compatibility is real as an operational and seeded model
- freelancer bootstrap is not a shipped public signup flow
- POST-GO-LIVE.3 must preserve freelancer compatibility without pretending a
  signup product already exists

### Auth

Current auth behavior:

- login validates email and bcrypt password
- access token is stateless and identity-only
- tenant authorization is resolved per request after JWT validation
- auth context endpoint returns:
  - `RESOLVED`
  - `UNRESOLVED`
  - `LEGACY_COMPATIBILITY`

Important current invariants:

- token does not fix the active organization
- token does not grant access without current membership validation
- no refresh flow currently exists
- no session store currently exists

### Tenant Context

Current pipeline:

`JWT -> optional X-Organization-Id -> membership lookup -> organization status validation -> immutable TenantContext -> capability and module policy`

Current request-time behavior:

- malformed or repeated `X-Organization-Id` returns `400`
- foreign or ineligible tenant selection returns redacted `403`
- multiple eligible memberships without selection returns:
  - allowed unresolved state for optional bootstrap routes
  - `409` for tenant-required routes
- inactive membership or inactive organization blocks tenant-required access
- resolution is revalidated on every request
- no cache is used
- no JWT reissue is needed to switch tenants conceptually

Current context fields:

- `userId`
- `organizationId`
- `membershipId`
- `organizationRole`
- `legacyUserRole`
- `resolutionMode`

Current conclusion:

- the current design already supports safe multi-membership switching by header
- the source of truth is per-request validation, not a long-lived claim

### Roles

Current organizational roles in runtime and schema:

- `OWNER`
- `ADMIN`
- `PSYCHOLOGIST`
- `RECEPTIONIST`
- `BILLING`
- `AUDITOR`
- `READ_ONLY`

Current effective posture:

- `OWNER` is the only role with owner-only authority
- `ADMIN` is a delegated administrative role
- `PSYCHOLOGIST` remains the principal clinical role
- `RECEPTIONIST` is operational and appointment-focused
- `BILLING` is finance-focused
- `AUDITOR` is metadata-focused and default-deny for clinical content
- `READ_ONLY` remains highly constrained and default-deny for clinical content

Current critical rule already preserved in runtime:

- `OWNER` and `ADMIN` do not automatically bypass clinical assignment

### Current capabilities

Current closed capability catalog in code includes:

- organization:
  - `organization.read`
  - `organization.manage`
- membership:
  - `membership.read`
  - `membership.invite`
  - `membership.manage_role`
  - `membership.suspend`
  - `membership.reactivate`
  - `membership.remove`
  - `membership.leave`
- invitation:
  - `invitation.read`
  - `invitation.create`
  - `invitation.revoke`
- clinical, document, appointment, finance, audit capabilities

Current runtime observations:

- organization domain capabilities are real runtime inputs
- `organization.manage` exists in the catalog but no organization update or
  suspension route currently uses it
- invitation and membership capabilities are implemented
- conditional admin behavior is enforced inside services, not only through the
  reusable capability guard

### Invitation

Current Prisma structure:

| Field | Notes |
| --- | --- |
| `email` | Original email |
| `normalizedEmail` | Persisted normalized key |
| `invitedUserId` | Optional recipient binding |
| `role` | Requested future membership role |
| `tokenDigest` | Required SHA-256 digest |
| `expiresAt` | Required TTL boundary |
| `acceptedAt` | Terminal timestamp |
| `acceptedByUserId` | Bound accepter |
| `rejectedAt` | Terminal timestamp |
| `revokedAt` | Terminal timestamp |
| `expiredAt` | Materialized terminal timestamp |

Current runtime endpoints:

- `GET /organizations/:organizationId/invitations`
- `POST /organizations/:organizationId/invitations`
- `POST /organizations/:organizationId/invitations/:invitationId/revoke`
- `POST /organization-invitations/:token/accept`
- `POST /organization-invitations/:token/reject`

Current runtime semantics:

- token is generated randomly and stored only as digest
- clear token is returned once only outside production
- duplicate pending invitation conflicts are enforced
- invitation creation does not create a membership row
- acceptance creates an `ACTIVE` membership row
- rejection and revocation are terminal
- expiry is materialized inside a transaction when encountered
- no resend endpoint exists
- no invitation update endpoint exists
- role `OWNER` is blocked in DTOs for invitation creation

Current structural conclusion:

- invitations are partially beyond "contract only"; they are real runtime
  behavior
- membership administration and invitation lifecycle already exist
- POST-GO-LIVE.3 therefore must refine, normalize, and extend the organization
  domain rather than pretending to start from zero

### Seed and Postman evidence

POST-GO-LIVE.2.2 currently proves:

- synthetic active and suspended organizations
- synthetic active and suspended memberships
- synthetic multi-membership user
- all organizational roles represented
- organization-scoped clinical and financial fixtures
- no legacy-null rows created by the development seed

Important audit conclusion:

- seed and Postman artifacts are runtime-adjacent tooling
- they are not evidence of complete organization administration product
  behavior

## Gap analysis

| Domain | Current capability | Gap | Impact | Risk | Future phase |
| --- | --- | --- | --- | --- | --- |
| Organization create | No public runtime flow | Missing authenticated organization bootstrap and additional-org creation flow | Blocks 3.1 | High | 3.1 |
| Organization update | Read-only runtime | Missing identity update contract and edit projection | Blocks 3.1 | Medium | 3.1 |
| Organization suspend/reactivate/archive | Schema states exist, no admin routes | Missing lifecycle operations and explicit effects | Blocks 3.1 | High | 3.1 |
| Membership history | `REVOKED` used for remove and leave | Missing persisted terminal reason semantics | Decision contract | Medium | 3.2 |
| Membership re-entry | Unique `(organizationId, userId)` | Removed user cannot rejoin via a new row | Blocks 3.2 | High | 3.2 migration |
| Ownership transfer | Generic role change forbids `OWNER` | Missing explicit add-owner / transfer flow | Blocks 3.2 | High | 3.2 |
| Invitation resend | No route | Missing resend semantics and replay posture | Blocks 3.3 | Medium | 3.3 |
| Active organization preference | Header-only selection plus UX-only persisted preference runtime | Preferred organization stored on `User` without tenant authority | Implemented locally, review pending | Low | 3.6 |
| Public freelancer signup | No runtime route | Missing public bootstrap flow | Deferable for org admin, blocker for self-service onboarding | Medium | 3.5 |
| Admin audit persistence | Observability only | No dedicated administrative audit store | Deferable | Medium | 3.5+ |
| Member list projection | Narrow sanitized list | No search, pagination, richer projections, or email policy split | Blocks 3.2 | Medium | 3.2 |
| Organization capability granularity | Existing `organization.manage` is broad and unused | Need explicit operation contract or documented reuse | Decision contract | Low | 3.1 |
| Docs coherence | Some docs still say org routes are not implemented | Source-of-truth contradiction | Operational | Medium | 3.0 |

Blocker classification:

- blocker for 3.1:
  - organization create
  - organization update
  - organization lifecycle operations
- blocker for 3.2:
  - ownership transfer
  - membership re-entry posture
  - member list/product projection
- blocker for 3.3:
  - invitation resend and replay-safe reissue semantics
- blocker for 3.5:
  - public freelancer self-service signup if product chooses to ship it

## Normative contract

### Organization identity

Normative posture:

- `id` remains UUID and server-owned
- `slug` is the stable technical identifier
- `legalName` is the formal identity field
- `displayName` is the user-facing identity field
- `timezone`, `locale`, and `currency` remain organization-scoped metadata
- branding and operational preference fields remain reserved and out of scope
  for the first administration increment unless explicitly included

Editable fields for POST-GO-LIVE.3.1 target:

- `legalName`
- `displayName`
- `slug`, only through validated normalization and uniqueness checks

Server-owned fields:

- `id`
- `status`
- `createdAt`
- `updatedAt`
- any future lifecycle actor/timestamp fields

Reserved for later phases:

- `OrganizationBranding`
- `OrganizationSettings`
- commercial or billing attributes
- support-only operational metadata

### Organization lifecycle

Approved conceptual states:

- `PROVISIONING`
- `ACTIVE`
- `SUSPENDED`
- `ARCHIVED`

Normative transitions:

| From | To | Actor | Conditions | HTTP on invalid transition |
| --- | --- | --- | --- | --- |
| none | `PROVISIONING` or `ACTIVE` | authenticated creator or signup bootstrap | successful transaction and owner membership creation | `409` |
| `PROVISIONING` | `ACTIVE` | system-complete bootstrap | invariants satisfied | `409` |
| `ACTIVE` | `SUSPENDED` | active `OWNER` with capability | target org selected and mutation authorized | `409` |
| `SUSPENDED` | `ACTIVE` | active `OWNER` with capability | reversible administrative decision | `409` |
| `ACTIVE` or `SUSPENDED` | `ARCHIVED` | support or explicitly approved owner flow | no active operational use; no deletion | `409` |

Normative effects:

- suspending an organization invalidates tenant authority immediately on the
  next request
- organization suspension does not move or retag clinical or financial data
- suspended organizations remain tenant-owned data containers
- archiving is non-destructive

Deletion posture:

- physical deletion is prohibited as a self-service administration action
- if ever required, it is a support-only or future platform operation with a
  separate contract

### Organization creation

Normative posture:

- a future authenticated user may create additional organizations
- freelancer bootstrap remains compatible
- every successful organization creation must atomically create the initial
  `OWNER` membership
- initial organization status should be:
  - `ACTIVE` for simple local bootstrap where prerequisites are satisfied
  - `PROVISIONING` only when the product actually needs a multi-step bootstrap

Idempotency contract:

- duplicate slug attempts return `409`
- partial failure must roll back user-owned creation side effects in the same
  transaction
- client must never supply the authoritative owner membership identifiers

### Organization read and update

Normative read projections:

- bootstrap list route may remain limited to caller-accessible organizations
- scoped organization detail may expose identity and lifecycle metadata
- fields reserved for branding/settings remain omitted unless the module phase
  expressly includes them

Normative update posture:

- owner-authorized update only
- no client-owned lifecycle fields
- optimistic concurrency is recommended through `updatedAt` comparison or an
  equivalent contract, but no new schema field is strictly required

### Membership identity and uniqueness

Normative posture:

- one active membership relation per user and organization at a time
- one organizational role per membership row
- capabilities remain derived, not persisted
- multi-membership is allowed across organizations

Historical posture:

- a removed membership is historical and should not be silently reactivated
- the preferred long-term posture is to preserve each membership period with
  independent historical identity
- the current schema does not yet allow that posture because the absolute unique
  `(organizationId, userId)` constraint permits only one membership row per
  user and organization pair
- therefore the concrete schema strategy for re-entry remains provisional and
  gated for POST-GO-LIVE.3.2
- POST-GO-LIVE.3.1 must not assume multiple historical membership rows and must
  not depend on this schema decision being resolved

### Membership lifecycle

Normative lifecycle decisions:

- invitation issuance creates or updates only an invitation record
- acceptance creates a membership row in `ACTIVE`
- `INVITED` membership rows are not required by the preferred contract
- active runtime membership states for the first implementation track:
  - `ACTIVE`
  - `SUSPENDED`
  - `REVOKED` as terminal historical state

Normative transition map:

| Origin | Action | Destination | Notes |
| --- | --- | --- | --- |
| none | invitation accepted | `ACTIVE` | membership row created on accept |
| `ACTIVE` | suspend | `SUSPENDED` | reversible |
| `SUSPENDED` | reactivate | `ACTIVE` | reversible |
| `ACTIVE` or `SUSPENDED` | remove | `REVOKED` | terminal historical state |
| `ACTIVE` | voluntary leave | `REVOKED` | terminal historical state |

Explicit decisions:

- no reactivation from `REVOKED`
- no reuse of a removed membership row as if nothing happened
- distinction between administrative remove and self-leave is captured by the
  action type and future audit event, not by requiring a new enum today

### Membership list and query

Normative read posture:

- `OWNER` and `ADMIN` may list memberships with administrative projection
- `AUDITOR` may read a sanitized projection
- other roles do not receive membership list access by default

Target projection guidance:

- always allowed:
  - membership `id`
  - `role`
  - `status`
  - lifecycle timestamps
- owner/admin administrative view may include:
  - user `id`
  - display name
  - normalized contact projection as approved
- auditor view should avoid full email values unless separately approved

Target list behavior:

- tenant-scoped only
- pagination recommended
- search by visible user fields recommended
- cross-tenant and nonexistent membership IDs stay indistinguishable where
  direct access applies

### Membership role change

Normative posture:

- generic role change must never be the mechanism for ownership transfer
- `OWNER` grant belongs to a dedicated ownership flow
- `ADMIN` cannot mutate an `OWNER`
- `ADMIN` cannot self-elevate or grant above ADMIN
- an `OWNER` may self-degrade only if another active `OWNER` remains after the
  same transactional decision
- the owner-preservation check must be concurrency-safe; a simple pre-read count
  is not sufficient by itself
- invalid no-op role changes return `409`

### Membership suspension and reactivation

Normative posture:

- suspension immediately makes the membership ineligible for tenant context on
  the next request
- existing JWT remains identity-only and becomes insufficient without active
  membership
- suspended membership data remains historical
- reactivation is allowed only from `SUSPENDED`
- an `OWNER` may self-suspend only if another active `OWNER` remains after the
  same transactional decision
- the future runtime must validate this invariant inside a transaction that is
  safe against concurrent owner mutations

### Membership removal

Normative posture:

- removal is a terminal historical state, not deletion
- removal must not delete or detach tenant-owned clinical or financial data
- patient assignments linked to the removed membership remain historical and
  later implementation may end active assignments explicitly
- owner removal, including self-removal, is allowed only if another active
  `OWNER` remains after the same transactional decision
- re-entry should be modeled through a future invitation or explicit create
  flow, not by mutating the removed row back to active; whether that re-entry
  creates a new membership row or reuses another stable structure remains gated
  for POST-GO-LIVE.3.2 schema review

### Voluntary leave

Normative posture:

- self-leave is allowed only for an active membership
- self-leave of the last active owner is forbidden
- self-leave ends tenant eligibility immediately on the next request
- after leave, a client may continue using another valid membership by sending
  another valid `X-Organization-Id`
- an `OWNER` may leave only if another active `OWNER` remains after the same
  transactional decision

### Historical re-entry gate

Current schema reality:

- `@@unique([organizationId, userId])` allows only one membership row per
  user/organization pair today
- a removed membership already preserves historical state by remaining
  persisted and ineligible for access

Current contractual posture:

- the preferred long-term posture is that each membership period can preserve
  independent historical identity
- that preference is not yet an approved schema decision because it conflicts
  with the current absolute unique key
- the re-entry strategy is therefore provisional and gated for
  POST-GO-LIVE.3.2
- POST-GO-LIVE.3.1 cannot modify schema for this question
- POST-GO-LIVE.3.1 cannot assume multiple historical rows
- any eventual schema change requires a separate migration review and must not
  edit historical migrations

Alternatives POST-GO-LIVE.3.2 must compare explicitly:

- Alternative A - reactivate the existing row:
  preserves schema compatibility and avoids migration, but weakens historical
  separation across membership periods
- Alternative B - allow multiple historical rows:
  best supports distinct history periods, but likely requires changing or
  removing the current unique key, defining a single-current-membership rule,
  updating queries, and planning migration/backfill/rollback
- Alternative C - keep one stable membership plus separate history:
  preserves a single active row while moving period history elsewhere, but adds
  model complexity and extra migration work
- Alternative D - accept a new invitation that reuses the stable membership:
  reduces schema churn, but mixes re-entry semantics with row reactivation and
  may obscure independent period history

### Ownership

#### Foundational rule

- every active organization must retain at least one active `OWNER`

#### Multiple owners

- multiple active owners are allowed
- they are recommended for resilience and transfer safety

#### Active owner counting rule

Only memberships that are both:

- `role = OWNER`
- `status = ACTIVE`

count as active owners for invariant protection.

The following do not count as active owners:

- suspended memberships
- revoked or removed memberships
- pending invitations
- expired invitations
- revoked invitations
- rejected invitations
- any future user-level deactivation state, if the product later models it

#### Owner-protection rules

- no actor may leave the organization with zero active owners
- no actor may suspend the last active owner
- no actor may remove the last active owner
- no generic role-change flow may downgrade the last active owner
- pending `OWNER` invitations never satisfy the active-owner invariant
- `ADMIN` never executes suspension, removal, downgrade, or transfer operations
  against `OWNER`
- the protection depends on validated capability, persisted membership state,
  and ownership invariants, not on any role value supplied by the client

#### Owner self-operations

- self-suspension is allowed only if another active `OWNER` remains after the
  same transactional decision
- self-degradation is allowed only if another active `OWNER` remains after the
  same transactional decision and the target role is otherwise valid
- self-removal and voluntary leave are allowed only if another active `OWNER`
  remains after the same transactional decision
- self-operations never delete tenant-owned data and invalidate tenant
  eligibility on the next request when they succeed
- future runtime enforcement must be transaction-safe and concurrency-safe; a
  simple count performed before the write is not sufficient by itself
- implementation may use locking, conditional updates, serializable retries, or
  another PostgreSQL-compatible strategy, but this contract does not choose a
  single technique yet

#### Ownership transfer

Normative posture:

- ownership transfer is an explicit future operation
- it is not modeled as a generic membership role patch
- the preferred flow is:
  - ensure the destination user has an eligible membership or invitation
  - add or promote a new owner
  - confirm owner-count invariant
  - optionally downgrade the previous owner in the same serializable decision

### Invitations

#### Issuance

- invitation issuance creates an invitation record, not a membership row
- invitation may target:
  - an existing user
  - a not-yet-existing user
- inviting an existing user is allowed
- `OWNER` cannot be granted by invitation

#### Persistence

- token must remain hashed at rest
- clear token must never be persisted
- token may be returned only once in controlled non-production flows

#### Accept

- accept requires authenticated recipient binding
- normalized email must match
- when `invitedUserId` exists, it must match too
- successful accept creates the membership row in `ACTIVE`

#### Reject, revoke, expire

- rejection, revocation, and expiry remain distinct
- expiry may remain materialized transactionally, not by background job

#### Resend

Normative posture:

- resend should rotate the token
- resend should revoke or otherwise terminally retire the previous pending
  invitation before issuing a new one
- resend should extend expiry through the new invitation record or rotated
  token contract

This is `CONTRATO PROPUESTO - NO IMPLEMENTADO`.

### Active organization and multi-membership

#### Source of truth

Normative decision:

- active organization lives in per-request validated selection
- current and future source of truth is `X-Organization-Id` plus server
  revalidation
- a future persisted preference may exist for UX only
- a persisted preference must never replace request-time validation

#### Multi-membership

- one user may hold memberships in multiple organizations
- if exactly one eligible membership exists, the backend may auto-resolve
- if several eligible memberships exist, explicit selection is required
- suspended memberships and suspended organizations are not eligible

#### Switch organization

Normative decision:

- switching organization does not require a new JWT
- the safe switch is the next request using another authorized
  `X-Organization-Id`
- a future preference endpoint is optional and must store preference only,
  never authority

Conceptual future API inventory:

- no dedicated switch endpoint is required for baseline API correctness
- if a product endpoint is later added, its contract is:
  - authenticated user only
  - destination organization must already be eligible
  - no capability needed beyond valid membership eligibility
  - no new JWT required
  - cross-tenant or ineligible target stays redacted

### Proposed administrative capabilities

The existing runtime catalog already includes:

- `organization.read`
- `organization.manage`
- `membership.read`
- `membership.invite`
- `membership.manage_role`
- `membership.suspend`
- `membership.reactivate`
- `membership.remove`
- `membership.leave`
- `invitation.read`
- `invitation.create`
- `invitation.revoke`

Additional proposed vocabulary:

`CONTRATO PROPUESTO - NO IMPLEMENTADO`

| Capability | Purpose | Default role posture |
| --- | --- | --- |
| `organization.update` | Update editable organization identity | OWNER |
| `organization.suspend` | Suspend organization | OWNER |
| `organization.reactivate` | Reactivate organization | OWNER |
| `organization.archive` | Archive organization | OWNER or support-only |
| `invitation.resend` | Reissue invitation safely | OWNER, optional ADMIN |
| `ownership.transfer` | Transfer or add owner explicitly | OWNER only |
| `audit.read` | Read sanitized administrative audit events | OWNER, AUDITOR |

Minimization rule:

- if the project wants lower implementation churn, 3.1 may continue using the
  broad existing `organization.manage` capability and map the finer operations
  inside policy code

### HTTP semantics

Normative error matrix:

| Condition | Response |
| --- | --- |
| malformed input or malformed tenant selector | `400` |
| missing/invalid/expired JWT | `401` |
| valid tenant, visible action, missing capability or recipient mismatch | `403` |
| foreign tenant resource or hidden direct identifier | `404` |
| duplicate slug, duplicate pending invitation, invalid transition, last-owner conflict, terminal replay, concurrent write conflict | `409` |

`422` posture:

- not required for this project at this phase
- keep the contract aligned to existing `400/401/403/404/409`

### Security contract

| Threat | Severity | Mitigation |
| --- | --- | --- |
| client-owned `organizationId` | Critical | server-derived tenant scope only |
| client-owned `role` or OWNER promotion | Critical | dedicated policy, owner-only transfer, DTO rejection |
| last-owner loss | Critical | serializable owner-count invariant |
| invitation token theft/replay | High | digest-only persistence, terminal timestamps, one-time semantics |
| stale JWT after membership/org suspension | High | revalidation on every request |
| email or organization enumeration | High | redacted `403/404`, sanitized projections |
| concurrent ownership changes | High | serializable transaction + bounded retries |
| cross-tenant IDOR | Critical | path equality checks, tenant predicates, redacted `404` |
| removed-membership data drift | Medium | terminal history, no automatic data transfer |
| sensitive logs | High | never log tokens, JWTs, passwords, clinical notes, or full payloads |

### Administrative audit and observability

Future events that should exist:

- organization created
- organization updated
- organization suspended
- organization reactivated
- organization archived
- invitation created
- invitation resent
- invitation revoked
- invitation accepted
- invitation rejected
- invitation expired
- membership role changed
- membership suspended
- membership reactivated
- membership removed
- membership left voluntarily
- owner added
- owner removed
- ownership transferred
- active organization preference changed, if that feature exists
- security denial events

Allowed metadata:

- actor technical IDs
- organization ID
- target membership/invitation/user ID
- result
- reason code
- timestamp
- correlation ID

Forbidden metadata:

- passwords
- invitation clear tokens
- JWTs
- clinical notes
- full PHI payloads
- sensitive filenames
- secrets

### Future OpenAPI inventory

`CONTRATO FUTURO - NO IMPLEMENTADO`

Recommended conceptual operations:

- organization:
  - create
  - read current
  - list accessible
  - update identity
  - suspend
  - reactivate
  - archive
- membership:
  - list
  - change role
  - suspend
  - reactivate
  - remove
  - leave
  - add owner / transfer ownership
- invitations:
  - create
  - list
  - revoke
  - resend
  - accept
  - reject

### Future E2E strategy

Required scenario groups:

- organization:
  - additional organization creation
  - duplicate slug
  - identity update
  - suspension/reactivation
  - archived or suspended access
- membership:
  - list
  - role change
  - admin restriction against owner
  - suspension/reactivation
  - remove
  - leave
  - last-owner protection
- invitations:
  - create
  - duplicate pending
  - accept existing user
  - accept new user
  - reject
  - revoke
  - expire
  - resend
  - replay
- ownership:
  - multiple owners
  - transfer
  - self-degrade denial for last owner
  - concurrent owner mutation
- multi-membership:
  - unresolved context
  - explicit selection
  - switch without new JWT
  - suspended organization
  - suspended membership

### Potential migrations

| Change | Classification | Rationale |
| --- | --- | --- |
| case-insensitive normalized organization slug | Probably necessary | public create/update flow should prevent equivalent duplicates |
| historical membership re-entry support beyond absolute `(organizationId, userId)` unique key | Probably necessary | new membership row after removal is otherwise blocked |
| membership actor/reason metadata | Optional | improves history, not required for first admin increment |
| persisted active-organization preference | Optional | UX improvement only |
| dedicated ownership transfer persistence | Optional | may be handled by membership rows plus audit events |
| new membership statuses beyond `ACTIVE/SUSPENDED/REVOKED` | Not recommended now | current semantics can stay simpler |
| physical delete support for organizations | Not recommended | conflicts with tenant-owned data retention |
| public-user normalized email on `User` | Pending decision | useful for durable invite/signup canonicalization |

### Compatibility and rollout

Recommended future order:

1. documentation contract
2. schema and migration review for unavoidable gaps
3. organization creation and identity administration
4. membership administration hardening and historical re-entry
5. invitation resend and ownership transfer
6. optional persisted active-organization preference
7. tenant organization-domain certification
8. frontend administration flows
9. production preparation
10. deployment and later backfill controls where applicable

Compatibility guarantees to preserve:

- current freelancer owner operating model
- current tenant context and JWT model
- current D0 through D5 clinical and financial boundaries
- current local seed and Postman tooling
- no weakening of legacy-null exclusion

## Required decisions

1. Multiple `OWNER` memberships are allowed, but every active organization must retain at least one active owner.
2. A user may create multiple organizations in future phases.
3. The active organization resides in per-request validated selection, not in the JWT.
4. Switching organization does not require a new JWT.
5. Suspending an organization invalidates access immediately on the next request.
6. Suspending a membership invalidates access immediately on the next request.
7. Membership removal is a terminal historical state, not deletion.
8. A removed membership should not be reactivated; the preferred long-term posture is independent history periods, but the concrete schema strategy for re-entry remains gated for POST-GO-LIVE.3.2.
9. The system must block any transition that would leave an active organization without at least one active owner.
10. `ADMIN` cannot administer `OWNER`.
11. An invitation creates a membership on acceptance, not on issuance.
12. Invitation tokens must be stored hashed.
13. Resend should rotate the token and retire the previous pending invitation.
14. Inviting an existing user is allowed if recipient binding still matches the authenticated accepter.
15. Freelancer compatibility must be preserved, even though public freelancer signup does not yet exist.
16. Branding and settings fields remain reserved for later phases unless explicitly pulled into the admin MVP.
17. Likely migrations are required for membership re-entry history and possibly slug/email normalization.
18. Organization lifecycle operations and switch-by-header behavior can be implemented without a JWT migration.
19. Deferred work includes public signup, persisted preferences, richer audit persistence, and frontend UX.
20. A dedicated ADR is required for active-organization source of truth and preference semantics.

## Final contract posture

POST-GO-LIVE.3 does not begin from an empty organization domain. The current
backend already ships:

- organization read APIs;
- membership mutation APIs;
- invitation lifecycle APIs;
- tenant-safe multi-membership selection;
- owner-protection invariants.

Therefore POST-GO-LIVE.3 should be executed as a contract-normalization and
gap-closing phase for a partially implemented organization domain, while
preserving the D0 through D5 tenant-aware clinical and financial platform.

## References

- `docs/AUTHORIZATION_CONTRACT.md`
- `docs/AUTHORIZATION_CAPABILITY_MATRIX.md`
- `docs/TENANT_ENDPOINT_SCOPE_MATRIX.md`
- `docs/TENANT_SECURITY_TEST_CONTRACT.md`
- `docs/POST_GO_LIVE_2_1D0_TENANT_CONVERSION_CONTRACT.md`
- `docs/POST_GO_LIVE_2_1_TENANT_PLATFORM_CERTIFICATION.md`
- `docs/DEVELOPMENT_SEED_AND_POSTMAN.md`
- `docs/adr/ADR-TENANT-CONTEXT.md`
- `docs/adr/ADR-TENANT-DATA-ISOLATION.md`
- `docs/adr/ADR-INVITATION-MEMBERSHIP-LIFECYCLE.md`
