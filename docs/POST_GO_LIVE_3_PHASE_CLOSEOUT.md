# POST-GO-LIVE.3 Phase Closeout

## Purpose

This document records the certified backend closeout state for:

```text
POST-GO-LIVE.3 - Organization, Membership, Invitation and Bootstrap Platform
```

Phase 3 functional work is complete on backend scope. The certified functional
baseline is:

```text
6c65a4d8956723071514c40ec6942ecc39c0dcd2
```

That baseline already contains POST-GO-LIVE.3.0 through POST-GO-LIVE.3.6 and
completed post-merge `Backend CI` in success. The formal Phase 3 baseline is
still pending the merge of this documentation-only closeout PR.

This document does not declare production rollout complete.

## Functional baseline

| Item | Value |
| --- | --- |
| Repository | `felixyz-code/psychology-app-backend` |
| Functional baseline | `6c65a4d8956723071514c40ec6942ecc39c0dcd2` |
| Source phase | `POST-GO-LIVE.3.6 - Preferred Organization UX Runtime` |
| Merge PR | `#42` |
| Post-merge CI | `Backend CI #104` |
| CI run | `30760494506` |
| CI job | `91529987249` |
| Current closeout state | `PHASE 3 FUNCTIONAL WORK COMPLETE` |
| Formal closeout state | `PHASE 3 CLOSEOUT - REVIEW PENDING` |

## Phase 3 modules

| Module | Objective | PR | Merge commit | Post-merge CI | Status |
| --- | --- | ---: | --- | --- | --- |
| `3.0` | Organization and membership contract, ADRs, matrices | `#35` | `7d897ec8db2c5d372fce0b4dc0eaf3bd3b1d4b13` | `Backend CI #82` success | Closed and integrated |
| `3.1` | Organization administration runtime | `#37` | `2373ff046d56f455ecb9b5c4cc075f36f9ab778f` | `Backend CI #87` success | Closed and integrated |
| `3.2` | Membership administration and historical re-entry | `#38` | `206371972ee10958f62f01434c9ac2f5631d4ec6` | `Backend CI #90` success | Closed and integrated |
| `3.3` | Invitation administration runtime | `#39` | `5bb75dc4ae8deed67543f745abb23bac88508066` | `Backend CI #93` success | Closed and integrated |
| `3.4` | Ownership transfer runtime | `#40` | `77b4b6e6a70ef133459b84ea71c5d9590bfb6d0a` | `Backend CI #96` success | Closed and integrated |
| `3.5` | Canonical identity and public freelancer bootstrap | `#41` | `7b456901074807891c0384e214181e2ec8417d37` | `Backend CI #99` success | Closed and integrated |
| `3.6` | Preferred organization UX runtime | `#42` | `6c65a4d8956723071514c40ec6942ecc39c0dcd2` | `Backend CI #104` success | Closed and integrated |

## PRs, merges, and ancestry

The Phase 3 functional baseline descends from the tooling baseline
`51206bd4fa362ff1ab12e4d844bbef8bbc3f546e` and from every merged Phase 3
checkpoint listed above. Merge-parent inspection and ancestry validation
confirm those commits are legitimate ancestors of
`6c65a4d8956723071514c40ec6942ecc39c0dcd2`.

For POST-GO-LIVE.3.0 specifically, the contract baseline was merged by PR
`#35` at `7d897ec8db2c5d372fce0b4dc0eaf3bd3b1d4b13`. The later
documentation-only 3.0 closeout merged by PR `#36` at
`6c8ecbbfb566a1cb8c6b113f5493e04adbf80b12` remains part of the certified
ancestry chain, but it is not the functional Phase 3 baseline.

## Versioned migrations

Phase 3 closes over the current seven versioned Prisma migrations:

1. `20260715090000_baseline_current_schema`
2. `20260715090100_add_persistence_checks`
3. `20260717120000_add_saas_foundation`
4. `20260723120000_add_invitation_membership_lifecycle`
5. `20260729030000_membership_historical_reentry`
6. `20260801120000_add_user_normalized_email_bootstrap_runtime`
7. `20260802120000_add_user_preferred_organization_ux`

`migration_lock.toml` is not counted as a migration. The schema and migration
history remain aligned at this closeout point.

## Final model certification

### User

* `email` remains required and unique.
* `normalizedEmail` is required, unique, and defines canonical identity.
* `preferredOrganizationId` is nullable, indexed, and UX-only.
* Preferred organization uses a safe FK to `Organization` with
  `ON DELETE SET NULL`.

### Organization

* Organization remains the tenant boundary.
* Lifecycle remains `PROVISIONING`, `ACTIVE`, `SUSPENDED`, `ARCHIVED`.
* Ownership continues to derive from active `OrganizationMembership` rows.

### OrganizationMembership

* One organizational role per membership.
* `ACTIVE`, `SUSPENDED`, and `REVOKED` behavior is runtime-certified.
* Historical re-entry is supported through multiple `REVOKED` rows plus a
  partial unique index for non-terminal rows.
* Multiple active `OWNER` memberships remain allowed, but at least one active
  owner must always remain.

### OrganizationInvitation

* Tokens are stored only as digests.
* Logical status remains timestamp-derived.
* Resend uses replacement semantics instead of mutating the old token in
  place.

## Final endpoints

Phase 3 leaves the backend with these organization-domain runtime surfaces
integrated:

* `GET /organizations`
* `GET /organizations/current`
* `GET /organizations/:organizationId`
* `PATCH /organizations/:organizationId`
* `PATCH /organizations/:organizationId/status`
* `GET /organizations/:organizationId/memberships`
* `PATCH /organizations/:organizationId/memberships/:membershipId/role`
* `PATCH /organizations/:organizationId/memberships/:membershipId/status`
* `DELETE /organizations/:organizationId/memberships/:membershipId`
* `POST /organizations/:organizationId/memberships/leave`
* `GET /organizations/:organizationId/invitations`
* `POST /organizations/:organizationId/invitations`
* `POST /organizations/:organizationId/invitations/:invitationId/revoke`
* `POST /organizations/:organizationId/invitations/:invitationId/resend`
* `POST /organization-invitations/:token/accept`
* `POST /organization-invitations/:token/reject`
* `POST /organizations/:organizationId/ownership-transfer`
* `POST /auth/freelancer-bootstrap`
* `GET /auth/context`
* `PUT /auth/context/preference`

## Security posture

The closeout preserves these final Phase 3 invariants:

* JWT remains identity-only in the existing pre-Phase-3 shape and does not add
  tenant, membership, capability, or preferred-organization claims.
* `X-Organization-Id` remains the only request-time tenant selection hint.
* Tenant authorization still requires current `ACTIVE` membership plus
  `ACTIVE` organization validation in PostgreSQL on each request.
* Preferred organization does not authorize tenant access and is sanitized to
  `null` when stale.
* `ADMIN` still cannot administer `OWNER`.
* Ownership transfer remains dedicated, exclusive, and transactional.
* Invitation token persistence remains digest-only.
* Public freelancer bootstrap remains the only public owner-creation path.

## Seed certification

The current certified seed produces a tenant-aware disposable environment with:

* `3` organizations
* `14` users
* `14` memberships
* `6` patients
* `6` case files
* `3` session notes
* `3` documents
* `4` appointments
* `7` financial transactions

The final seed fixtures include:

* no-preference users
* valid preferred organization
* stale preferred organization
* multi-membership users
* invitation flows
* ownership scenarios
* freelancer-bootstrap compatible identity data

## Postman certification

The repo-local Postman certification remains versioned and executable in the
backend repository. The current certified closeout count is:

```text
25 requests
19 assertions
```

The collection covers auth, tenant context, organization administration,
membership administration, invitation administration, ownership transfer,
preferred organization UX, explicit independence from `X-Organization-Id`,
`preferredOrganizationId` null/valid/stale paths, and final fixture
restoration.

## Tests and CI

At Phase 3 functional baseline certification time:

* `npm run typecheck` passed
* `npm run lint` passed
* `npm run build` passed
* `npx prisma validate` passed
* `npx prisma migrate status` passed
* `npm run seed` passed
* `npm run seed:certify` passed
* `npm run postman:certify` passed
* `npm test -- --runInBand` passed with `52` suites passed, `2` skipped,
  `305` tests passed, `12` skipped
* `npm run test:e2e -- --runInBand` passed with `11` suites passed, `5`
  skipped, `44` tests passed, `28` skipped

The last integrated post-merge CI for the functional baseline is:

```text
Backend CI #104
Run 30760494506
Job 91529987249
SHA 6c65a4d8956723071514c40ec6942ecc39c0dcd2
Status success
```

That workflow completed migrations, migrate status, double seed, persistence,
readiness, typecheck, lint, formatting, tests, build, and Docker image gates.

## Residual risks

### Functional

No open functional Phase 3 blocker is recorded at closeout time.

### Operational

* Production rollout remains out of scope.
* Real email delivery remains deferred.
* Edge or WAF rate limiting remains deferred.
* Centralized observability, metrics, and alerts remain deferred.

### Technical debt

* GitHub Actions migration away from Node.js 20 remains future work.
* Phase naming and scope after Phase 3 still need an explicit roadmap
  decision.
* Feature-branch cleanup remains an operational follow-up, not a runtime
  blocker.

## Deferred work

| Pending item | Type | Suggested phase | Current blocker |
| --- | --- | --- | ---: |
| Frontend organization, membership, and invitation UX | Product | Roadmap decision required | Backend closeout only |
| Visual organization selector and richer switching UX | Product | Roadmap decision required | No next phase defined |
| Real email delivery | Operational | Roadmap decision required | Infra and sender policy |
| Signup verification and password reset | Auth | Roadmap decision required | Product and security design |
| Refresh tokens and MFA | Auth | Roadmap decision required | Security and session policy |
| Billing, plans, branding, and broader settings | SaaS | Roadmap decision required | Phase not authorized |
| Persistent audit log storage | Platform | Roadmap decision required | Observability design |
| Edge or WAF rate limiting | Infra | Roadmap decision required | Infra scope |
| Multi-instance throttle strategy | Infra | Roadmap decision required | Runtime topology |
| Production rollout and operational backfills | Release | Roadmap decision required | No rollout gate approved |

## Formal baseline pending

The certified functional baseline is:

```text
6c65a4d8956723071514c40ec6942ecc39c0dcd2
```

The formal Phase 3 baseline remains:

```text
pending closeout merge
```

That future formal baseline must be the merge commit of the dedicated closeout
PR after review and CI.

## Next phase entry

Current roadmap evidence does not yet define an authorized next runtime phase
after this closeout. The correct closeout statement is:

```text
NEXT PHASE REQUIRES ROADMAP DECISION
```

Recommended first gate: a roadmap-definition and scope gate that names the next
phase, fixes its boundary, and separates runtime work from operational rollout.

## Closure criteria

Phase 3 can be treated as formally closed only after:

1. this closeout documentation branch is reviewed;
2. the closeout PR remains Draft until controlled review finishes;
3. the closeout PR CI completes successfully;
4. the closeout PR is later merged under separate control;
5. no production readiness or rollout claim is added prematurely.

## Closeout statement

Phase 3 is backend functional platform complete for Phase 3 scope. It is not
yet production rolled out, and its formal baseline still depends on the merge
of the documentation-only closeout PR.
