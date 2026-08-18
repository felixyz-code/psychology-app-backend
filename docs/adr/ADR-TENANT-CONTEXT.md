# ADR: Tenant Context

## Status

Accepted for POST-GO-LIVE.2.1A. This is a target contract, not a claim that all
clinical modules are tenant-enforced.

## Decision

The access token identifies the user only. The optional
`X-Organization-Id` header selects an active organization per request; the
server validates it in PostgreSQL and creates one immutable `TenantContext`.
The header is a selection hint, never authority.

The current runtime already provides the foundation: `JwtAuthGuard` precedes
`TenantContextGuard`; the latter resolves an `ACTIVE` membership and an
`ACTIVE` organization, stores a frozen context in request `AsyncLocalStorage`,
and exposes that same instance through `@CurrentTenant()`.

## Resolution contract

1. Public and explicit skip routes bypass resolution.
2. JWT authentication establishes the current user from `sub`.
3. Active memberships and organizations are read on every authenticated request.
4. A valid header selects the matching active membership.
5. With no header, exactly one eligible membership resolves automatically.
6. Several eligible memberships are never selected by ordering; a
   tenant-required route returns `409 Organization selection is required`.
7. No eligible membership gives no context on an optional legacy route and
   `403 Tenant context is required` on a required route.

```ts
type TenantContext = Readonly<{
  userId: string;
  legacyUserRole: 'ADMIN' | 'PSYCHOLOGIST';
  organizationId: string;
  membershipId: string;
  organizationRole: OrganizationMembershipRole;
  resolutionMode: 'EXPLICIT' | 'SINGLE_MEMBERSHIP';
}>;
```

Capabilities are not stored in the context today. A future policy service
derives them from the versioned capability matrix, so role-policy changes do
not leave a long-lived context or JWT authoritative.

## Header and transport rules

`X-Organization-Id` occurs once and contains a UUID. Invalid or repeated
values return `400`; foreign, nonexistent, inactive, revoked, or suspended
selection returns the same `403 Organization access denied` response. This
prevents enumeration. The header must be listed in CORS allowed headers and
Swagger for tenant-required routes. It must never be accepted through a DTO,
path, body, query, cookie, or client state as a context substitute.

## Alternatives rejected

* **Organization in JWT:** stale after role change, revocation, suspension, or
  switching; it makes the token an authorization source.
* **Organization in each route:** changes the API and risks disagreement with
  request context.
* **Server-side selected-tenant session:** adds Redis/session and scaling
  complexity without improving per-request validation.

## Security and compatibility

There is intentionally no membership cache. A future cache needs invalidation
for membership status, role, organization status, and user state. A tenant
switch is a new request with another valid header; no JWT reissue is needed.
Revocation and suspension take effect on the next request.

`GET /auth/context` is tenant-optional for bootstrap: it returns a resolved
context, an `UNRESOLVED` list of the caller's selectable memberships, or
`LEGACY_COMPATIBILITY`. It never returns other users' memberships, clinical
data, headers, tokens, or a persisted selection.

Existing tenant-optional routes retain legacy authorization until converted.
At this checkpoint only `/patients` requires tenant context and uses the
temporary `organizationId + psychologistId` double barrier. Null organization
scope is never silently treated as a selected organization.
