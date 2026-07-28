# ADR: Organization Active Selection

## Status

Accepted for POST-GO-LIVE.3.0 as a documentation contract. This ADR does not
change runtime behavior by itself.

## Context

The current backend already resolves tenant authority per request from the
authenticated user, active memberships, active organization state, and the
optional `X-Organization-Id` header. JWTs carry identity only and do not carry
organization authority. POST-GO-LIVE.3 needs an explicit decision on where the
active organization lives once organization administration, multi-membership,
and switching become first-class product concerns.

## Decision

The active organization remains a per-request validated selection.

Normative posture:

- the source of truth is the authenticated request plus a validated
  `X-Organization-Id` selection hint;
- the backend revalidates membership and organization state on every request;
- the JWT remains identity-only and does not become an authorization cache for
  organization choice;
- switching organization does not require JWT reissue;
- a future persisted preference may exist for UX, but it is preference only,
  never authority.

If a future preference endpoint is added, it stores only a preferred default
organization for the next bootstrap experience. It does not bypass:

- active membership validation;
- active organization validation;
- cross-tenant denial;
- current per-request capability and assignment checks.

## Reason

This preserves the strongest existing tenant-aware property in the current
platform:

- revocation, suspension, and owner changes take effect on the next request;
- no stale token becomes tenant authority;
- parallel tabs and API clients can safely switch by sending different valid
  headers;
- multi-membership remains stateless and horizontally scalable.

## Consequences

Positive consequences:

- no new JWT issuance protocol is required for organization switching;
- no server-side session store is required for correctness;
- tenant authority remains bound to request-time validation;
- Postman and API clients stay simple and explicit.

Constraints:

- ambiguous users must still send an explicit selection;
- UX may later want a persisted preference, but that preference remains
  secondary to request-time validation;
- any future "switch organization" endpoint is optional for preference
  persistence and is not required for the core authorization model.

## Boundary

This ADR does not approve:

- a server-side mutable active-tenant session as authority;
- organization claims inside JWT as authority;
- client-owned organization identifiers in body, query, or DTO payloads;
- any runtime implementation, migration, deployment, or production change.
