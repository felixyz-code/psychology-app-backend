# POST-GO-LIVE.4 - SaaS User Experience / Frontend Integration Contract

## Formal status

~~~text
PHASE: POST-GO-LIVE.4 - SaaS User Experience
STATUS: CONTRACT FINALIZED
WIRE CONTRACT VERSION: 1
IMPLEMENTATION: READY AFTER CONTRACT COMMITS
PRODUCTION ROLLOUT: NOT AUTHORIZED
READINESS TARGET: SAAS DEMO-READY
~~~

This is one distributed specification. The frontend and backend copies must
remain identical in vocabulary, schemas, states, capabilities, endpoint
metadata, errors, and lifecycle rules.

The frontend owns rendering, navigation, interaction, and client invalidation.
The backend owns DTO validation, tenant authority, authorization, persistence,
concurrency, and redaction.

## 1. Authority and accepted technical debt

JWT is identity-only. X-Organization-Id is request-time tenant authority.
preferredOrganizationId, URLs, history state, sessionStorage, client roles,
and client capabilities never authorize a request. The backend validates every
protected request and redacts hidden cross-tenant resources.

The following debt is accepted for SAAS DEMO-READY and does not authorize
production rollout:

| Debt | Boundary and justification |
| --- | --- |
| JWT in localStorage | Existing MVP storage remains; the token is forbidden in events, logs, URLs, or feature state. Storage migration is a separate security phase. |
| Cross-tab transport | The observable rules in section 12 are mandatory; the browser transport is not prescribed. |
| Internal store ownership | resetTenantState and generation rules are mandatory; Angular decomposition is implementation detail. |
| Advanced retry | No automatic mutation retry; retry is user-controlled per section 8. |
| Pagination | Phase 4 uses bounded demo projections; server pagination is deferred. |
| Advanced offline | Safe error and user retry only; no offline mutation queue exists. |
| Read idempotency tokens | Client generations protect rendering; the backend does not persist a read-generation token. |

## 2. Endpoint metadata

Every endpoint belongs to exactly one category:

| Mode | JWT | X-Organization-Id |
| --- | --- | --- |
| PUBLIC | No | No |
| IDENTITY_ONLY | Yes | No |
| TENANT_OPTIONAL | Yes | Optional validated header |
| TENANT_REQUIRED | Yes | Confirmed tenant ID required |

The interceptor attaches JWT only for authenticated modes and attaches
X-Organization-Id only for TENANT_OPTIONAL or TENANT_REQUIRED. It never
infers mode from a URL denylist and never retries mutations automatically.

## 3. Definitive GET /auth/context contract

Request: GET /auth/context, Bearer JWT, optional UUID header, no body.
Malformed or repeated header returns 400 VALIDATION_ERROR. An ineligible
header returns redacted 403 FORBIDDEN.

The V1 response always contains every field below. Nullable fields are present
as null and arrays are present as empty arrays.

~~~json
{
  "schemaVersion": 1,
  "status": "ACTIVE_TENANT_READY",
  "tenantContext": {
    "userId": "uuid",
    "organizationId": "uuid",
    "membershipId": "uuid",
    "organizationRole": "OWNER",
    "resolutionMode": "EXPLICIT"
  },
  "organization": {
    "id": "uuid",
    "displayName": "string",
    "status": "ACTIVE"
  },
  "membership": {
    "id": "uuid",
    "userId": "uuid",
    "displayName": "string or null",
    "email": "string",
    "role": "OWNER",
    "status": "ACTIVE",
    "createdAt": "date-time",
    "updatedAt": "date-time",
    "isCurrentUser": true
  },
  "capabilities": ["organization.read"],
  "selectableMemberships": [],
  "preferredOrganizationId": "uuid or null"
}
~~~

The definitive field domains are:

- schemaVersion is the integer 1.
- status is one of ACTIVE_TENANT_READY, AMBIGUOUS_SELECTION,
  NO_ACTIVE_TENANT, or ADMIN_SUSPENDED_CONTEXT.
- tenantContext is required for ACTIVE_TENANT_READY and
  ADMIN_SUSPENDED_CONTEXT and is null for the other statuses.
- tenantContext.organizationRole is one of OWNER, ADMIN, PSYCHOLOGIST,
  RECEPTIONIST, BILLING, AUDITOR, or READ_ONLY.
- tenantContext.resolutionMode is EXPLICIT or SINGLE_MEMBERSHIP.
- organization is required for the two resolved statuses and null otherwise.
  organization.status is ACTIVE or SUSPENDED.
- membership is required for the two resolved statuses and null otherwise.
  membership.role uses the role enum above; membership.status is ACTIVE for
  the resolved context. displayName is nullable; email is canonical.
- selectableMemberships is always an array. Each item contains exactly
  membershipId, organizationId, organizationDisplayName, and
  organizationRole. The first three values are UUID, UUID, and string;
  organizationRole uses the role enum above.
- capabilities is always an array of strings from the closed catalog in
  section 6.
- preferredOrganizationId is always UUID or null and is never an authority
  field.

Allowed status values are exactly:

| Status | Required behavior |
| --- | --- |
| ACTIVE_TENANT_READY | Active organization, active membership, populated tenantContext, organization, membership, and capabilities. |
| AMBIGUOUS_SELECTION | No confirmed tenant; selectableMemberships contains all eligible active memberships; capabilities is empty. |
| NO_ACTIVE_TENANT | No eligible active membership; selectableMemberships and capabilities are empty. |
| ADMIN_SUSPENDED_CONTEXT | Suspended organization and active membership may be shown only for permitted administration; operational capabilities are absent. |

The historical RESOLVED, UNRESOLVED, and LEGACY_COMPATIBILITY responses are
not Phase 4 inputs. A missing field, unknown status, invalid identity,
unknown schemaVersion, or invalid capability enters ERROR; no silent legacy
interpretation exists.

## 4. Context version and tenant lifecycle

switchGeneration and contextVersion are client-only coordination values.

- switchGeneration increments on identity change, logout, candidate tenant
  change, access loss, or tenant reset. It does not increment for a same-tenant
  context refresh.
- contextVersion increments after every accepted context snapshot, including
  same-tenant role, capability, membership, organization-status, or preference
  refresh. It resets for a new identity lifecycle.
- switchGeneration distinguishes tenant replacement from stale work.
  contextVersion distinguishes refreshed authorization context from replacement.
- Neither value is persisted as authority, sent as a JWT claim, or used by the
  backend for authorization.

Source of truth:

| Value | Rule |
| --- | --- |
| candidateOrganizationId | In-memory only until confirmation |
| selectedOrganizationId | In-memory only after V1 confirmation |
| sessionStorage tenant ID | Confirmed ID only; remove on logout, identity change, access loss, and reset |
| preferredOrganizationId | Backend UX preference only |
| URL | Navigation input only |
| history state | Ephemeral invitation intent only |

## 5. Definitive state table

| State | Origin | Allowed destinations | Events and backend trigger | Frontend UX |
| --- | --- | --- | --- | --- |
| UNINITIALIZED | New tab or cleared identity | LOADING, ERROR | login, refresh | Tenant UI blocked |
| LOADING | Initial context request | ACTIVE_TENANT_READY, AMBIGUOUS_SELECTION, NO_ACTIVE_TENANT, ADMIN_SUSPENDED_CONTEXT, FORBIDDEN, ERROR | context response/failure | Tenant UI blocked |
| ACTIVE_TENANT_READY | Confirmed active context | SWITCHING, LOADING, ADMIN_SUSPENDED_CONTEXT, FORBIDDEN, ERROR, UNINITIALIZED | switch, refresh, access loss, logout | Operational shell visible |
| SWITCHING | Tenant candidate or identity reset | ACTIVE_TENANT_READY, AMBIGUOUS_SELECTION, NO_ACTIVE_TENANT, ADMIN_SUSPENDED_CONTEXT, FORBIDDEN, ERROR | switch response/failure | Old data hidden |
| AMBIGUOUS_SELECTION | Multiple eligible memberships | SWITCHING, LOADING, UNINITIALIZED | candidate selected, logout | Selector only |
| NO_ACTIVE_TENANT | Zero eligible memberships | LOADING, ADMIN_SUSPENDED_CONTEXT, UNINITIALIZED | membership change, login, logout | No-membership UX only |
| ADMIN_SUSPENDED_CONTEXT | Valid suspended admin context | ACTIVE_TENANT_READY, SWITCHING, LOADING, FORBIDDEN, UNINITIALIZED | restore, switch, access loss, logout | Admin shell; no operational data |
| FORBIDDEN | Redacted denied context/action | LOADING, SWITCHING, UNINITIALIZED, ERROR | access denied, logout | Least-revealing recovery |
| ERROR | Unsafe or failed context resolution | LOADING, SWITCHING, UNINITIALIZED | user retry, logout | Recovery only |

No implicit transition is valid. A same-tenant context refresh does not enter
SWITCHING.

## 6. Capabilities

Capabilities serialize as a JSON array of exact case-sensitive ASCII strings.
The array is non-null, lexically ascending by Unicode code point, duplicate
free, and uses no aliases or case folding. Unknown values are absent to the
frontend. The backend remains authoritative.

Closed catalog:

organization.read, organization.manage,
membership.read, membership.manage_role, membership.suspend,
membership.reactivate, membership.remove, membership.leave,
invitation.read, invitation.create, invitation.revoke, invitation.resend,
ownership.transfer,
patient.read, patient.create, patient.update, patient.delete,
case_file.read, case_file.create, case_file.update, workspace.read,
session_note.read, session_note.create, session_note.update, session_note.delete,
document.metadata_read, document.upload, document.download, document.update,
document.delete, appointment.read, appointment.manage,
finance.read, finance.manage, finance.summary_read, report.read.

For every row below, the guard is capability-aware UX only; backend policy and
assignment checks remain mandatory.

| Module actions | Capability | Backend authority | Frontend UX | Guard | Interceptor |
| --- | --- | --- | --- | --- | --- |
| Organization read/manage | organization.read / organization.manage | Selected tenant and OWNER/status policy | Show identity/admin controls | Capability guard | TENANT_REQUIRED |
| Membership read/role/suspend/reactivate/remove/leave | membership.read / membership.manage_role / membership.suspend / membership.reactivate / membership.remove / membership.leave | Membership policy, self-only leave, owner invariant, CAS | Show permitted list/actions | Capability guard | TENANT_REQUIRED |
| Invitation read/create/revoke/resend | invitation.read / invitation.create / invitation.revoke / invitation.resend | Invitation policy and terminal state | Show permitted admin actions | Capability guard | TENANT_REQUIRED |
| Ownership transfer | ownership.transfer | Active OWNER, eligible target, transaction | Strong confirmation and immediate refresh | Capability guard | TENANT_REQUIRED |
| Patients read/create/update/delete | patient.read / patient.create / patient.update / patient.delete | Tenant, capability, assignment | Show or enable permitted operations | Capability guard | TENANT_REQUIRED |
| Case Files read/create/update | case_file.read / case_file.create / case_file.update | Tenant, capability, assignment | Show or enable permitted operations | Capability guard | TENANT_REQUIRED |
| Workspace read | workspace.read | Tenant, capability, assignment | Show clinical workspace | Capability guard | TENANT_REQUIRED |
| Session Notes read/create/update/delete | session_note.read / session_note.create / session_note.update / session_note.delete | Tenant, capability, assignment | Show or enable permitted operations | Capability guard | TENANT_REQUIRED |
| Documents metadata/upload/download/update/delete | document.metadata_read / document.upload / document.download / document.update / document.delete | Metadata authorization, tenant, capability, assignment | Show or enable permitted operations | Capability guard | TENANT_REQUIRED |
| Appointments read/manage | appointment.read / appointment.manage | Tenant and operational/clinical policy | Show permitted fields/actions | Capability guard | TENANT_REQUIRED |
| Financial read/manage/summary | finance.read / finance.manage / finance.summary_read | Organization-scoped financial policy | Show or enable permitted operations | Capability guard | TENANT_REQUIRED |
| Reports read | report.read | Report and redaction policy | Show report navigation/exports | Capability guard | TENANT_REQUIRED |

## 7. Error contract

All errors use:

~~~json
{
  "statusCode": 409,
  "code": "CONCURRENT_UPDATE",
  "message": "The resource changed. Refresh and try again.",
  "requestId": "opaque-request-id",
  "details": null
}
~~~

message is never parsed. details is bounded and never contains tokens, JWTs,
stack traces, clinical data, cross-tenant existence, or unnecessary PII.

| Code | HTTP | Details schema | Retry | Redacted | Frontend action |
| --- | ---: | --- | --- | --- | --- |
| VALIDATION_ERROR | 400 | fields: [{ field, code, message }] or null | Correct input; no automatic retry | Safe fields only | Bind form errors |
| UNAUTHENTICATED | 401 | null | Re-authenticate | Yes | Clear identity/tenant; route login |
| FORBIDDEN | 403 | reasonCode or null | No automatic retry | Yes | Forbidden/recovery; retain context unless access lost |
| TENANT_CONTEXT_REQUIRED | 409 | reason: MISSING or AMBIGUOUS | Select explicitly | Yes | Context selector |
| RESOURCE_NOT_FOUND | 404 | null | No blind retry | Yes | Redacted not-found |
| CONFLICT | 409 | resource, transition or null | Refresh then deliberate retry | Safe only | Refresh and explain |
| CONCURRENT_UPDATE | 409 | resource, retryContext: true or null | Refresh context/resource then deliberate retry | Safe only | Reload and reconfirm |
| CAPABILITY_DENIED | 403 | capability or null | No automatic retry | Policy not disclosed | Hide/disable action |
| INVITATION_TERMINAL | 409 | terminalState | Reload only | No token/recipient data | Show terminal state |
| INVITATION_RECIPIENT_MISMATCH | 403 | null | Explicit re-authentication | Yes | Safe mismatch UX |
| RATE_LIMITED | 429 | retryAfterSeconds or null | User-controlled backoff | Safe only | Throttle guidance |
| UNEXPECTED_ERROR | 500/502/503/504 | category: SERVER or null | User-controlled retry | Generic | Show requestId |
| NETWORK_OFFLINE | client status 0 | offline: true | User-controlled retry | N/A | Offline recovery |

## 8. Endpoint matrix

The following is exhaustive for Phase 4. DTO names are frozen contract names.
Reports have no independent REST endpoint; report.read gates frontend
composition of the source requests below.

| Method | Route | Tenant mode | Capability | Interceptor mode | Errors | DTO | Consumer |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | / | PUBLIC | none | PUBLIC | none | RootResponse | Infrastructure |
| GET | /health | PUBLIC | none | PUBLIC | none | HealthResponse | Infrastructure |
| POST | /auth/login | PUBLIC | none | PUBLIC | VALIDATION_ERROR, UNAUTHENTICATED | LoginRequest/Response | AuthStore |
| POST | /auth/freelancer-bootstrap | PUBLIC | none | PUBLIC | VALIDATION_ERROR, CONFLICT, RATE_LIMITED, UNEXPECTED_ERROR | BootstrapRequest/Response | Signup |
| GET | /auth/context | TENANT_OPTIONAL | none | TENANT_OPTIONAL | VALIDATION_ERROR, UNAUTHENTICATED, FORBIDDEN | AuthContextResponseV1 | TenantContextStore |
| PUT | /auth/context/preference | IDENTITY_ONLY | none | IDENTITY_ONLY | VALIDATION_ERROR, UNAUTHENTICATED, RESOURCE_NOT_FOUND, CONFLICT | PreferenceRequest/Response | Preference |
| GET | /organizations | IDENTITY_ONLY | none | IDENTITY_ONLY | UNAUTHENTICATED | OrganizationSelectableListResponse | Selector |
| GET | /organizations/current | TENANT_REQUIRED | organization.read | TENANT_REQUIRED | UNAUTHENTICATED, FORBIDDEN, RESOURCE_NOT_FOUND | OrganizationResponse | Organization |
| GET | /organizations/:id | TENANT_REQUIRED | organization.read | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND | OrganizationResponse | Organization |
| PATCH | /organizations/:id | TENANT_REQUIRED | organization.manage | TENANT_REQUIRED | VALIDATION_ERROR, FORBIDDEN, CONFLICT, CONCURRENT_UPDATE | OrganizationUpdateRequest/Response | Organization |
| PATCH | /organizations/:id/status | TENANT_REQUIRED | organization.manage | TENANT_REQUIRED | VALIDATION_ERROR, FORBIDDEN, CONFLICT, CONCURRENT_UPDATE | OrganizationStatusRequest/Response | Organization |
| GET | /organizations/:id/memberships | TENANT_REQUIRED | membership.read | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND | MembershipListResponse | Membership |
| PATCH | /organizations/:id/memberships/:mid/role | TENANT_REQUIRED | membership.manage_role | TENANT_REQUIRED | VALIDATION_ERROR, FORBIDDEN, RESOURCE_NOT_FOUND, CONFLICT, CONCURRENT_UPDATE | MembershipRoleRequest/Response | Membership |
| PATCH | /organizations/:id/memberships/:mid/status | TENANT_REQUIRED | membership.suspend or membership.reactivate | TENANT_REQUIRED | VALIDATION_ERROR, FORBIDDEN, RESOURCE_NOT_FOUND, CONFLICT, CONCURRENT_UPDATE | MembershipStatusRequest/Response | Membership |
| DELETE | /organizations/:id/memberships/:mid | TENANT_REQUIRED | membership.remove | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND, CONFLICT, CONCURRENT_UPDATE | MembershipRevocationResponse | Membership |
| POST | /organizations/:id/memberships/leave | TENANT_REQUIRED | membership.leave | TENANT_REQUIRED | FORBIDDEN, CONFLICT, CONCURRENT_UPDATE | MembershipRevocationResponse | Membership |
| GET | /organizations/:id/invitations | TENANT_REQUIRED | invitation.read | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND | InvitationListResponse | Invitations |
| POST | /organizations/:id/invitations | TENANT_REQUIRED | invitation.create | TENANT_REQUIRED | VALIDATION_ERROR, FORBIDDEN, CONFLICT | InvitationCreateRequest/Response | Invitations |
| POST | /organizations/:id/invitations/:iid/revoke | TENANT_REQUIRED | invitation.revoke | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND, INVITATION_TERMINAL | InvitationTerminalResponse | Invitations |
| POST | /organizations/:id/invitations/:iid/resend | TENANT_REQUIRED | invitation.resend | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND, INVITATION_TERMINAL | InvitationResendResponse | Invitations |
| POST | /organization-invitations/:token/accept | IDENTITY_ONLY | recipient binding | IDENTITY_ONLY | UNAUTHENTICATED, FORBIDDEN, RESOURCE_NOT_FOUND, INVITATION_TERMINAL, INVITATION_RECIPIENT_MISMATCH | InvitationDecisionResponse | Invitations |
| POST | /organization-invitations/:token/reject | IDENTITY_ONLY | recipient binding | IDENTITY_ONLY | UNAUTHENTICATED, FORBIDDEN, RESOURCE_NOT_FOUND, INVITATION_TERMINAL, INVITATION_RECIPIENT_MISMATCH | InvitationDecisionResponse | Invitations |
| POST | /organizations/:id/ownership-transfer | TENANT_REQUIRED | ownership.transfer | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND, CONFLICT, CONCURRENT_UPDATE | OwnershipTransferRequest/Response | Ownership |
| POST | /patients | TENANT_REQUIRED | patient.create | TENANT_REQUIRED | VALIDATION_ERROR, FORBIDDEN, CONFLICT | PatientCreateRequest/Response | Patients |
| GET | /patients | TENANT_REQUIRED | patient.read | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND | PatientListResponse | Patients |
| GET | /patients/:id | TENANT_REQUIRED | patient.read | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND | PatientResponse | Patients |
| PATCH | /patients/:id | TENANT_REQUIRED | patient.update | TENANT_REQUIRED | VALIDATION_ERROR, FORBIDDEN, RESOURCE_NOT_FOUND, CONCURRENT_UPDATE | PatientUpdateRequest/Response | Patients |
| DELETE | /patients/:id | TENANT_REQUIRED | patient.delete | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND, CONFLICT | DeleteResponse | Patients |
| POST | /case-files | TENANT_REQUIRED | case_file.create | TENANT_REQUIRED | VALIDATION_ERROR, FORBIDDEN, CONFLICT | CaseFileCreateRequest/Response | Case Files |
| GET | /case-files | TENANT_REQUIRED | case_file.read | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND | CaseFileListResponse | Case Files |
| GET | /case-files/patient/:patientId | TENANT_REQUIRED | case_file.read | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND | CaseFileListResponse | Case Files |
| GET | /case-files/:id | TENANT_REQUIRED | case_file.read | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND | CaseFileResponse | Case Files |
| GET | /case-files/:id/workspace | TENANT_REQUIRED | workspace.read | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND | WorkspaceResponse | Workspace |
| PATCH | /case-files/:id | TENANT_REQUIRED | case_file.update | TENANT_REQUIRED | VALIDATION_ERROR, FORBIDDEN, RESOURCE_NOT_FOUND, CONCURRENT_UPDATE | CaseFileUpdateRequest/Response | Case Files |
| POST | /session-notes | TENANT_REQUIRED | session_note.create | TENANT_REQUIRED | VALIDATION_ERROR, FORBIDDEN, CONFLICT | SessionNoteCreateRequest/Response | Session Notes |
| GET | /session-notes | TENANT_REQUIRED | session_note.read | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND | SessionNoteListResponse | Session Notes |
| GET | /session-notes/case-file/:caseFileId | TENANT_REQUIRED | session_note.read | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND | SessionNoteListResponse | Session Notes |
| GET | /session-notes/:id | TENANT_REQUIRED | session_note.read | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND | SessionNoteResponse | Session Notes |
| PATCH | /session-notes/:id | TENANT_REQUIRED | session_note.update | TENANT_REQUIRED | VALIDATION_ERROR, FORBIDDEN, RESOURCE_NOT_FOUND, CONCURRENT_UPDATE | SessionNoteUpdateRequest/Response | Session Notes |
| DELETE | /session-notes/:id | TENANT_REQUIRED | session_note.delete | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND, CONFLICT | DeleteResponse | Session Notes |
| POST | /documents/upload | TENANT_REQUIRED | document.upload | TENANT_REQUIRED | VALIDATION_ERROR, FORBIDDEN, RESOURCE_NOT_FOUND | DocumentUploadRequest/Response | Documents |
| POST | /documents | TENANT_REQUIRED | document.upload | TENANT_REQUIRED | VALIDATION_ERROR, FORBIDDEN, CONFLICT | DocumentCreateRequest/Response | Documents |
| GET | /documents | TENANT_REQUIRED | document.metadata_read | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND | DocumentListResponse | Documents |
| GET | /documents/case-file/:caseFileId | TENANT_REQUIRED | document.metadata_read | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND | DocumentListResponse | Documents |
| GET | /documents/:id | TENANT_REQUIRED | document.metadata_read | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND | DocumentResponse | Documents |
| GET | /documents/:id/download | TENANT_REQUIRED | document.download | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND | DocumentDownloadResponse | Documents |
| GET | /documents/:id/view | TENANT_REQUIRED | document.download | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND | DocumentViewResponse | Documents |
| PATCH | /documents/:id | TENANT_REQUIRED | document.update | TENANT_REQUIRED | VALIDATION_ERROR, FORBIDDEN, RESOURCE_NOT_FOUND, CONCURRENT_UPDATE | DocumentUpdateRequest/Response | Documents |
| DELETE | /documents/:id | TENANT_REQUIRED | document.delete | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND, CONFLICT | DeleteResponse | Documents |
| POST | /appointments | TENANT_REQUIRED | appointment.manage | TENANT_REQUIRED | VALIDATION_ERROR, FORBIDDEN, CONFLICT | AppointmentCreateRequest/Response | Appointments |
| GET | /appointments | TENANT_REQUIRED | appointment.read | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND | AppointmentListResponse | Appointments |
| GET | /appointments/patient/:patientId | TENANT_REQUIRED | appointment.read | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND | AppointmentListResponse | Appointments |
| GET | /appointments/:id | TENANT_REQUIRED | appointment.read | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND | AppointmentResponse | Appointments |
| PATCH | /appointments/:id | TENANT_REQUIRED | appointment.manage | TENANT_REQUIRED | VALIDATION_ERROR, FORBIDDEN, RESOURCE_NOT_FOUND, CONCURRENT_UPDATE | AppointmentUpdateRequest/Response | Appointments |
| DELETE | /appointments/:id | TENANT_REQUIRED | appointment.manage | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND, CONFLICT | DeleteResponse | Appointments |
| POST | /financial-transactions | TENANT_REQUIRED | finance.manage | TENANT_REQUIRED | VALIDATION_ERROR, FORBIDDEN, CONFLICT | FinancialTransactionCreateRequest/Response | Financial |
| GET | /financial-transactions | TENANT_REQUIRED | finance.read | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND | FinancialTransactionListResponse | Financial |
| GET | /financial-transactions/summary | TENANT_REQUIRED | finance.summary_read | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND | FinancialSummaryResponse | Financial |
| GET | /financial-transactions/:id | TENANT_REQUIRED | finance.read | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND | FinancialTransactionResponse | Financial |
| PATCH | /financial-transactions/:id | TENANT_REQUIRED | finance.manage | TENANT_REQUIRED | VALIDATION_ERROR, FORBIDDEN, RESOURCE_NOT_FOUND, CONCURRENT_UPDATE | FinancialTransactionUpdateRequest/Response | Financial |
| DELETE | /financial-transactions/:id | TENANT_REQUIRED | finance.manage | TENANT_REQUIRED | FORBIDDEN, RESOURCE_NOT_FOUND, CONFLICT | DeleteResponse | Financial |

## 9. Invitation lifecycle

Invitation intent contains only the token and a safe return route. It exists in
memory/history state for one login redirect and is never durable, logged,
telemetry-captured, copied, or retained after the decision.

| Event | Behavior |
| --- | --- |
| Initial link | Capture and scrub URL before authentication or decision UI |
| Refresh | Resume only if ephemeral intent survives; otherwise require re-entry |
| Back/forward | Sanitized URL cannot reconstruct a token; terminal state is not retried |
| Accept/reject | Send once, consume intent immediately, honor backend terminal result |
| Terminal replay | Show INVITATION_TERMINAL; no automatic mutation |
| Recipient mismatch | Safe mismatch UX; no mutation; explicit re-authentication required |
| Expired/revoked | Show terminal EXPIRED or REVOKED state; no retry with same token |
| Logout during flow | Clear token, JWT, tenant state, and URL; re-entry required |
| Multiple tabs | Each tab owns its intent; backend terminal state wins |

## 10. Session lifecycle

| Event | JWT | Selected/candidate tenant | sessionStorage | Preference | Stores | Observable cross-tab behavior |
| --- | --- | --- | --- | --- | --- | --- |
| Login | New | Both null until V1 | Remove previous ID | Read through V1 | Clear tenant stores | All tabs clear old identity |
| Logout | Cleared | Both null | Remove | Not retained | Clear auth, tenant, dialogs, forms | All tabs become unauthenticated |
| Refresh | Rehydrated if valid | Session ID is candidate only | Confirmed ID remains until V1 | Read through V1 | Block until V1 | No tenant adoption by other tabs |
| Tenant switch | Same | Candidate ephemeral; selected commits after V1 | Write confirmed ID only | Independent write | Reset before load | Only initiating tab switches |
| Context refresh | Same | Same selected ID if valid | Unchanged | Replace sanitized value | Refresh context stores | Other tabs revalidate on event |
| Membership revoked/suspended | Same until backend response | Cleared | Remove | Re-read on V1 | Reset and recover | Every tab revalidates |
| Organization suspended/restored | Same | Admin context or active after V1 | Confirmed ID only | Re-read on V1 | Operational stores blocked/restored | Every tab revalidates |
| Ownership transfer | Same | Same ID after refresh | Unchanged | Refreshed | Refresh caps and route | Every tab revalidates |

## 11. Cross-tenant invalidation

Every tenant-bound store implements resetTenantState(reason,
switchGeneration). It clears data, loading/error state, selections, caches,
dialogs, forms, and pending actions. It is idempotent.

A response is discarded when its captured generation or expected organization
does not match current state. Discarding emits stale_response_discarded
without sensitive payloads.

## 12. Observable multi-tab contract

- Logout clears identity and tenant-bound UI in every tab and routes each tab
  to a safe unauthenticated surface.
- Membership suspension, revocation, ownership transfer, and organization
  status changes require every tab to revalidate its own V1 context before
  showing tenant data or actions.
- A tenant switch affects only its initiating tab.
- A preference change never forces another tab to switch tenants.
- A cross-tab signal is never authority; stale or malformed signals only cause
  backend revalidation.

## 13. Ownership and membership projection

Ownership is role-based and OWNER is derived only from role. Transfer is a
dedicated operation to another ACTIVE non-OWNER membership. The backend
enforces the last ACTIVE OWNER invariant transactionally. Current-user role or
status changes require context and capability refresh before actions return.

The bounded minimum membership projection is id, userId, nullable displayName,
canonical email, role, status, createdAt, updatedAt, and isCurrentUser.
Historical REVOKED rows are omitted from current administration lists.

## 14. Certification and consistency checklist

| Item | Result |
| --- | --- |
| DTOs | PASS - V1 context and endpoint DTO names frozen |
| Endpoints | PASS - each Phase 4 endpoint has one explicit metadata row |
| Capabilities | PASS - closed catalog and exhaustive module/action mapping |
| States | PASS - origins, destinations, events, UX, and backend triggers frozen |
| Errors | PASS - status, code, details, retry, redaction, and action frozen |
| Tenant lifecycle | PASS - switch, refresh, reset, suspension, and restoration frozen |
| Invitation lifecycle | PASS - refresh, navigation, mismatch, terminal, and logout frozen |
| Ownership | PASS - transfer, last owner, self lockout, and refresh frozen |
| Session lifecycle | PASS - login, logout, refresh, and access loss frozen |
| Endpoint metadata | PASS - PUBLIC, IDENTITY_ONLY, TENANT_OPTIONAL, TENANT_REQUIRED frozen |
| Technical debt | PASS - accepted boundaries documented |
| Cross references | PASS - paired files must be identical |

## 15. Final gate

~~~text
F-01: RESOLVED
F-03: RESOLVED
F-04: RESOLVED
F-07: RESOLVED
ACCEPTED TECHNICAL DEBT: DOCUMENTED
CONTEXT VERSION: RESOLVED
CONTRACT: IMPLEMENTATION READY
PRODUCTION ROLLOUT: NOT AUTHORIZED
~~~
