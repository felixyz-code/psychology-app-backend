# ADR: Organization Active Selection

## Status

Accepted as the proposed POST-GO-LIVE.3.0 contract posture in PR Draft #35.
This ADR does not change runtime behavior by itself and is not integrated into
`development` until the draft PR is reviewed and merged.

## Context

The current backend already resolves tenant authority per request from the
authenticated user, active memberships, active organization state, and the
optional `X-Organization-Id` header. JWTs carry identity only and do not carry
organization authority. `TenantContext` is derived after request-time
validation rather than restored from a mutable session record.

POST-GO-LIVE.3 needs an explicit decision on where the active organization
lives once organization administration, multi-membership, and switching become
first-class product concerns. The decision must remain coherent with:

- identity-first JWTs;
- per-request tenant validation;
- D0 through D5 tenant isolation guarantees;
- multi-membership users;
- Postman and explicit API clients;
- future frontend switching UX.

## Problem

The system must decide where "active organization" authority lives without
weakening cross-tenant safety. A naive header-only design is insufficient
because `X-Organization-Id` is untrusted client input. A naive JWT-bound design
is also insufficient because membership and organization state can change after
token issuance.

The question is therefore not only how a client expresses the intended
organization, but also which server-side validation remains authoritative when:

- a user has multiple memberships;
- multiple tabs issue concurrent requests to different organizations;
- a membership is suspended after token issuance;
- an organization is suspended after token issuance;
- Postman or API clients need explicit control;
- future UX wants a remembered default without creating a security boundary.

## Decision criteria

The decision was evaluated against:

- security and tenant isolation;
- immediate revocation after membership or organization changes;
- compatibility with the current runtime and JWT model;
- statelessness and horizontal scalability;
- support for concurrent tabs and concurrent requests;
- explicitness for API clients and Postman;
- operational complexity;
- future UX flexibility without creating hidden authority;
- avoidance of stale authorization state.

## Alternatives considered

### Alternative A - Tenant embedded in JWT

Advantages:

- request payload is smaller after login;
- some clients may find it simpler to omit a selector header.

Disadvantages:

- tenant choice becomes stale as soon as membership or organization state
  changes;
- switching organizations would require token reissue or multiple tokens;
- multi-membership becomes awkward and tab-unfriendly;
- revocation becomes slower or depends on extra token invalidation machinery.

Rejected because the current platform intentionally revalidates tenant
eligibility per request and does not treat JWTs as tenant authority.

### Alternative B - `X-Organization-Id` per request

Advantages:

- supports different organizations in parallel tabs and parallel requests;
- remains explicit for API clients, Postman, and future integrations;
- avoids storing mutable active-tenant authority server-side;
- works with the current runtime without JWT redesign.

Disadvantages:

- every client must handle the selector consistently;
- the header is not trustworthy by itself and must always be validated;
- ambiguous users need explicit selection and better client UX.

Selected because it matches the current runtime and preserves request-time
revalidation.

### Alternative C - Active organization persisted on `User`

Advantages:

- can provide a default bootstrap experience without sending a header first.

Disadvantages:

- creates mutable global state shared across tabs, browsers, and devices;
- invites race conditions when different sessions switch at the same time;
- risks accidental cross-context behavior when one client changes the default
  for another;
- does not eliminate the need for request-time validation.

Rejected as an authority source. A persisted preference may still exist later
as UX metadata only.

### Alternative D - Server-side session

Advantages:

- backend could store mutable active organization centrally;
- some clients might avoid repeated selector handling.

Disadvantages:

- introduces statefulness, session coordination, and infrastructure overhead;
- complicates horizontal scaling and operational behavior;
- still requires membership and organization revalidation for correctness;
- does not match the current stateless JWT-based runtime.

Rejected for the current platform model.

### Alternative E - Separate token per organization

Advantages:

- each token can express one organization explicitly;
- some audit models may find tenant-bound tokens attractive.

Disadvantages:

- high UX and storage complexity for multi-membership users;
- token rotation and logout become harder;
- Postman and integrations would need token juggling;
- stale-token and revocation problems still remain unless revalidation stays in
  place.

Rejected as unnecessary complexity for the present architecture.

### Alternative F - Controlled combination

Definition:

- request-time `X-Organization-Id` remains the authority input;
- a future persisted preference may suggest the default organization visually;
- the backend still validates membership and organization state on every
  request.

This is the only accepted combination. The persisted preference may improve UX,
but it never becomes the trust boundary.

## Decision

The active organization remains a per-request validated selection.

Normative posture:

- the source of truth is the authenticated request plus a validated
  `X-Organization-Id` selection hint;
- `X-Organization-Id` is untrusted input and is never sufficient by itself;
- the backend revalidates membership and organization state on every request;
- `TenantContext` remains the request-time authority object;
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

This decision explicitly supports:

- multiple tabs issuing requests to different organizations at the same time;
- parallel API requests selecting different authorized organizations;
- old tokens remaining usable for identity while still being denied if the
  membership or organization is no longer active;
- Postman and API clients remaining explicit and debuggable.

## Positive consequences

- no new JWT issuance protocol is required for organization switching;
- no server-side session store is required for correctness;
- tenant authority remains bound to request-time validation;
- stale tokens do not become tenant authority;
- Postman and API clients stay simple and explicit;
- concurrent tabs can switch safely without mutating shared server-side state.

## Negative consequences

- all clients must send the selector consistently when several memberships are
  eligible;
- request-time resolution adds repeated validation work;
- frontend and mobile clients must handle unresolved-context UX correctly;
- client-side context mistakes remain possible and need observability;
- support tooling must understand that header presence does not guarantee
  authorization success.

## Security

`X-Organization-Id` is input not trusted by itself.

Every tenant-scoped request must still validate:

- authenticated user identity;
- header format;
- selected organization existence within the user's reachable set;
- selected organization active state;
- selected membership existence;
- selected membership active state;
- current capabilities;
- tenant-scoped module policy and assignment where applicable.

This decision does not authorize:

- client-owned `organizationId` in DTO bodies or query payloads;
- JWT organization claims as authority;
- mutable server-side active-tenant state as the primary security boundary.

## Concurrency

The selected model intentionally avoids a mutable global "active tenant" on the
backend.

Concurrency consequences:

- multiple tabs may send different valid `X-Organization-Id` values safely;
- parallel requests may target different organizations without race conditions
  over shared session state;
- there is no global server-side preference write required for ordinary
  switching;
- suspending a membership or organization affects the next request because the
  backend revalidates current state instead of trusting old tokens.

## Clients

Client impact:

- future frontend must persist UI selection carefully and send the header when
  needed;
- Postman remains explicit and easy to reason about;
- API clients and integrations can switch tenant scope per request;
- future mobile clients can follow the same explicit-selection model;
- a future remembered default may improve UX, but it cannot bypass validation.

## Risks

- inconsistent client header handling can create avoidable `400`, `403`, or
  unresolved-context behavior;
- future teams may be tempted to treat remembered preferences as authority;
- observability is required so support can distinguish malformed selection,
  ineligible membership, and inactive organization cases without leaking
  cross-tenant data.

## Conditions for future review

This ADR should be revisited if any of the following becomes true:

- server-side sessions are introduced;
- the JWT model changes materially;
- tenant-bound tokens become a requirement;
- regulatory constraints require session-style active-tenant auditing;
- distributed `TenantContext` caching is introduced;
- SSO changes the login/session authority model;
- offline or intermittently connected clients cannot rely on request headers;
- switching requirements materially change;
- active-session audit requirements expand beyond current observability.

## Boundary

This ADR does not approve:

- a server-side mutable active-tenant session as authority;
- organization claims inside JWT as authority;
- client-owned organization identifiers in body, query, or DTO payloads;
- any runtime implementation, migration, deployment, or production change.
