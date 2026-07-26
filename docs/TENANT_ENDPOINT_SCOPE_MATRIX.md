# Tenant Endpoint Scope Matrix

`Current` is evidence from the present backend. `Target` is a future contract, not a runtime claim. Target cross-tenant resource access returns `404`; organization selection failures use the redacted `403` defined in the authorization contract.

| Method | Route | Module | Tenant required | Capability | Ownership/assignment | Cross-tenant | Current status | Conversion |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/` | Root | No | — | Public | N/A | Public | None |
| GET | `/health` | Root | No | — | Public | N/A | Public | None |
| GET | `/health/live` | Health | No | — | Public | N/A | Public | None |
| GET | `/health/ready` | Health | No | — | Public | N/A | Public | None |
| POST | `/auth/login` | Auth | No | — | Public | N/A | Public | None |
| GET | `/auth/context` | Auth | Optional | `organization.read` when resolved | Caller memberships only | 403 selection | Implemented tenant-optional | 2.1I bootstrap |
| POST | `/patients` | Patients | Yes | `patient.create` | Creates tenant patient and active self-assignment; temporary legacy psychologist restriction | 404 | D1 aligned | Complete in 2.1D1 |
| GET | `/patients` | Patients | Yes | `patient.read` | Tenant + active assignment + temporary legacy psychologist restriction | Empty list | D1 aligned | Complete in 2.1D1 |
| GET | `/patients/:id` | Patients | Yes | `patient.read` | Tenant + active assignment + temporary legacy psychologist restriction | 404 | D1 aligned | Complete in 2.1D1 |
| PATCH | `/patients/:id` | Patients | Yes | `patient.update` | Tenant + active assignment + temporary legacy psychologist restriction | 404 | D1 aligned | Complete in 2.1D1 |
| DELETE | `/patients/:id` | Patients | Yes | `patient.delete` | Tenant + active assignment + temporary legacy psychologist restriction; patient assignments removed before physical delete | 404 | D1 aligned | Complete in 2.1D1 |
| GET | `/organizations` | Organizations | Optional bootstrap | `organization.read` when resolved | Caller eligible memberships only | N/A | 2.1C0 contract approved; no route | 2.1C2 after 2.1C1 |
| GET | `/organizations/:organizationId` | Organizations | Yes | `organization.read` | Path must match resolved tenant | 404 | 2.1C0 contract approved; no route | 2.1C2 after 2.1C1 |
| GET | `/organizations/:organizationId/memberships` | Memberships | Yes | `membership.read` | Selected tenant only; AUDITOR gets sanitized metadata and no complete emails | 404 | 2.1C0 contract approved; no route | 2.1C2 after 2.1C1 |
| POST | `/organizations/:organizationId/invitations` | Invitations | Yes | `invitation.create` | Selected tenant; OWNER/ADMIN; no OWNER grant | 404 | 2.1C0 contract approved; no route | 2.1C2 after 2.1C1 |
| GET | `/organizations/:organizationId/invitations` | Invitations | Yes | `invitation.read` | Selected tenant; no digest/token projection | 404 | 2.1C0 contract approved; no route | 2.1C2 after 2.1C1 |
| POST | `/organizations/:organizationId/invitations/:invitationId/revoke` | Invitations | Yes | `invitation.revoke` | Selected tenant and PENDING state | 404 | 2.1C0 contract approved; no route | 2.1C2 after 2.1C1 |
| POST | `/organization-invitations/:token/accept` | Invitations | No tenant selection | Authenticated recipient binding | Redacted 404 | 2.1C0 contract approved; no route | 2.1C2 after 2.1C1 |
| POST | `/organization-invitations/:token/reject` | Invitations | No tenant selection | Authenticated recipient binding | Redacted 404 | 2.1C0 contract approved; no route | 2.1C2 after 2.1C1 |
| PATCH | `/organizations/:organizationId/memberships/:membershipId` | Memberships | Yes | Role/suspend/reactivate capability | Target must be same tenant and preserve owner invariant | 404 | 2.1C0 contract approved; no route | 2.1C2 after 2.1C1 |
| DELETE | `/organizations/:organizationId/memberships/:membershipId` | Memberships | Yes | `membership.remove` or `membership.leave` | Explicit administrative remove vs self-leave | 404 | 2.1C0 contract approved; no route | 2.1C2 after 2.1C1 |
| POST | `/case-files` | Case files | Yes | `case_file.create` | Patient tenant + active assignment + temporary legacy psychologist restriction | 404 | D2 aligned | Complete in 2.1D2 |
| GET | `/case-files` | Case files | Yes | `case_file.read` | Tenant + active assignment + temporary legacy psychologist restriction | Empty list | D2 aligned | Complete in 2.1D2 |
| GET | `/case-files/patient/:patientId` | Case files | Yes | `case_file.read` | Patient tenant + active assignment + temporary legacy psychologist restriction | 404 | D2 aligned | Complete in 2.1D2 |
| GET | `/case-files/:id` | Case files | Yes | `case_file.read` | Case file tenant + active assignment + temporary legacy psychologist restriction | 404 | D2 aligned | Complete in 2.1D2 |
| PATCH | `/case-files/:id` | Case files | Yes | `case_file.update` | Case file tenant + active assignment + temporary legacy psychologist restriction | 404 | D2 aligned | Complete in 2.1D2 |
| GET | `/case-files/:id/workspace` | Workspace | Yes | `workspace.read` | Case file tenant + active assignment; included relations carry `organizationId` predicates | 404 | D2 aligned | Complete in 2.1D2 |
| POST | `/session-notes` | Session notes | Yes | `session_note.create` | Case file tenant + active assignment + temporary legacy psychologist restriction | 404 | D2 aligned | Complete in 2.1D2 |
| GET | `/session-notes` | Session notes | Yes | `session_note.read` | Tenant + active assignment + temporary legacy psychologist restriction | Empty list | D2 aligned | Complete in 2.1D2 |
| GET | `/session-notes/case-file/:caseFileId` | Session notes | Yes | `session_note.read` | Case file tenant + active assignment + temporary legacy psychologist restriction | 404 | D2 aligned | Complete in 2.1D2 |
| GET | `/session-notes/:id` | Session notes | Yes | `session_note.read` | Note tenant + active assignment + temporary legacy psychologist restriction | 404 | D2 aligned | Complete in 2.1D2 |
| PATCH | `/session-notes/:id` | Session notes | Yes | `session_note.update` | Note tenant + active assignment + temporary legacy psychologist restriction | 404 | D2 aligned | Complete in 2.1D2 |
| DELETE | `/session-notes/:id` | Session notes | Yes | `session_note.delete` | Note tenant + active assignment + temporary legacy psychologist restriction | 404 | D2 aligned | Complete in 2.1D2 |
| POST | `/documents/upload` | Documents | Yes | `document.upload` | Case file tenant + active assignment + temporary legacy psychologist restriction | 404 | D2 aligned | Complete in 2.1D2 |
| POST | `/documents` | Documents | Yes | `document.upload` | Case file tenant + active assignment + temporary legacy psychologist restriction | 404 | D2 aligned | Complete in 2.1D2 |
| GET | `/documents` | Documents | Yes | `document.metadata_read` | Tenant + active assignment + temporary legacy psychologist restriction | Empty list | D2 aligned | Complete in 2.1D2 |
| GET | `/documents/case-file/:caseFileId` | Documents | Yes | `document.metadata_read` | Case file tenant + active assignment + temporary legacy psychologist restriction | 404 | D2 aligned | Complete in 2.1D2 |
| GET | `/documents/:id` | Documents | Yes | `document.metadata_read` | Document tenant + active assignment + temporary legacy psychologist restriction | 404 | D2 aligned | Complete in 2.1D2 |
| GET | `/documents/:id/view` | Documents | Yes | `document.download` | Document metadata authorized before filesystem; path constrained to tenant patient folder | 404 | D2 aligned | Complete in 2.1D2 |
| GET | `/documents/:id/download` | Documents | Yes | `document.download` | Document metadata authorized before filesystem; path constrained to tenant patient folder | 404 | D2 aligned | Complete in 2.1D2 |
| PATCH | `/documents/:id` | Documents | Yes | `document.update` | Document tenant + active assignment + temporary legacy psychologist restriction | 404 | D2 aligned | Complete in 2.1D2 |
| DELETE | `/documents/:id` | Documents | Yes | `document.delete` | Document tenant + active assignment + temporary legacy psychologist restriction; metadata delete before best-effort blob cleanup | 404 | D2 aligned | Complete in 2.1D2 |
| POST | `/appointments` | Appointments | Yes | `appointment.manage`; notes require clinical capability + assignment | Patient/professional same tenant; server tenant only | 404/403 | D3 aligned | Complete in 2.1D3 |
| GET | `/appointments` | Appointments | Yes | `appointment.read`; notes require clinical capability + assignment | Tenant; operational projection; notes minimized | Empty list | D3 aligned | Complete in 2.1D3 |
| GET | `/appointments/patient/:patientId` | Appointments | Yes | `appointment.read`; notes require clinical capability + assignment | Patient tenant; psychologist assignment for patient route | 404 | D3 aligned | Complete in 2.1D3 |
| GET | `/appointments/:id` | Appointments | Yes | `appointment.read`; notes require clinical capability + assignment | Appointment tenant; operational projection | 404 | D3 aligned | Complete in 2.1D3 |
| PATCH | `/appointments/:id` | Appointments | Yes | `appointment.manage`; notes require clinical capability + assignment | Tenant + relation consistency; receptionist cannot mutate notes | 404/403 | D3 aligned | Complete in 2.1D3 |
| DELETE | `/appointments/:id` | Appointments | Yes | `appointment.manage` | Appointment tenant | 404 | D3 aligned | Complete in 2.1D3 |
| POST | `/financial-transactions` | Finance | Yes | `finance.manage` | Tenant; patient/appointment match; server-derived creator | 404/400 mismatch | D3 aligned | Complete in 2.1D3 |
| GET | `/financial-transactions` | Finance | Yes | `finance.read` | Tenant predicate | Empty list | D3 aligned | Complete in 2.1D3 |
| GET | `/financial-transactions/summary` | Finance | Yes | `finance.summary_read` | Tenant-scoped groupBy | Empty summary | D3 aligned | Complete in 2.1D3 |
| GET | `/financial-transactions/:id` | Finance | Yes | `finance.read` | Transaction tenant | 404 | D3 aligned | Complete in 2.1D3 |
| PATCH | `/financial-transactions/:id` | Finance | Yes | `finance.manage` | Tenant + relation consistency; server-owned creator | 404/400 mismatch | D3 aligned | Complete in 2.1D3 |
| DELETE | `/financial-transactions/:id` | Finance | Yes | `finance.manage` | Transaction tenant | 404 | D3 aligned | Complete in 2.1D3 |

No backend report-export or dashboard endpoint exists at this checkpoint. Frontend-composed reports remain in scope because every upstream API must become tenant-scoped before they are isolated.

## POST-GO-LIVE.2.1D0 conversion contract

The rows marked for 2.1D remain the route inventory, but their detailed target
policy is now defined by
`POST_GO_LIVE_2_1D0_TENANT_CONVERSION_CONTRACT.md`. That contract is
documentation-only and does not alter the current runtime endpoint matrix.

For D1 through D3, clinical rows must be interpreted as tenant context plus
explicit module capability plus assignment when clinical content is returned.
The broad `clinical.read`, `clinical.write`, `document.read`, and `document.upload`
entries above are placeholders from the earlier target matrix, not automatic
role grants. Financial rows require financial capabilities and
`organizationId` predicates, not clinical assignment alone. Legacy
`organizationId = NULL` rows remain invisible to all tenant-aware endpoint
rows.

## POST-GO-LIVE.2.1C2 implementation status

The Organization, Membership, and Invitation rows above are now implemented.
`GET /organizations/current`, membership mutations, and self-leave use a
required resolved tenant context. Recipient accept/reject explicitly skip
tenant resolution so a pending invitation cannot establish tenant authority.
All organization-path mismatches are redacted as `404`.

## POST-GO-LIVE.2.1D4 integrated certification status

D4 adds no new endpoint rows. It certifies the existing D1, D2, and D3 rows
as one integrated tenant-aware contract, including cross-module relationship
validation, legacy-null exclusion, document blob authorization, appointment
notes, financial `createdById`, Financial Summary filters, and shared tenant
context semantics. Final POST-GO-LIVE.2.1D closure remains pending D5-R review,
controlled merge, and post-merge verification.

## POST-GO-LIVE.2.1D5 tenant platform certification status

D5 adds no new endpoint rows and does not change any public API contract. It
certifies the converted endpoint matrix as a final platform readiness package,
including tenant context, suspended membership denial, cross-tenant `404`,
clinical assignment, role boundaries, document blob blocking, server-owned
financial fields, summary isolation, legacy-null exclusion, default-deny
capabilities, and representative OpenAPI server-owned DTO assertions.
