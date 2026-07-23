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
| POST | `/patients` | Patients | Yes | `patient.create` | Current double barrier; target assignment policy | 404 | Implemented pilot | 2.1D align policy |
| GET | `/patients` | Patients | Yes | `patient.read` | Current double barrier | Empty list | Implemented pilot | 2.1D align policy |
| GET | `/patients/:id` | Patients | Yes | `patient.read` | Current double barrier | 404 | Implemented pilot | 2.1D align policy |
| PATCH | `/patients/:id` | Patients | Yes | `patient.update` | Current double barrier | 404 | Implemented pilot | 2.1D align policy |
| DELETE | `/patients/:id` | Patients | Yes | `patient.delete` | Current double barrier | 404 | Implemented pilot | 2.1D align policy |
| GET | `/organizations` | Organizations | Optional bootstrap | `organization.read` when resolved | Caller eligible memberships only | N/A | Contract proposed; no route | 2.1C2 after 2.1C1 |
| GET | `/organizations/:organizationId` | Organizations | Yes | `organization.read` | Path must match resolved tenant | 404 | Contract proposed; no route | 2.1C2 after 2.1C1 |
| GET | `/organizations/:organizationId/memberships` | Memberships | Yes | `membership.read` | Selected tenant only; identity projection pending AUDITOR decision | 404 | Contract proposed; no route | 2.1C2 after 2.1C1 |
| POST | `/organizations/:organizationId/invitations` | Invitations | Yes | `invitation.create` | Selected tenant; no OWNER grant | 404 | Contract proposed; no route | 2.1C2 after 2.1C1 |
| GET | `/organizations/:organizationId/invitations` | Invitations | Yes | `invitation.read` | Selected tenant; no digest/token projection | 404 | Contract proposed; no route | 2.1C2 after 2.1C1 |
| POST | `/organizations/:organizationId/invitations/:invitationId/revoke` | Invitations | Yes | `invitation.revoke` | Selected tenant and PENDING state | 404 | Contract proposed; no route | 2.1C2 after 2.1C1 |
| POST | `/organization-invitations/:token/accept` | Invitations | No tenant selection | Recipient binding | Authenticated recipient only | Redacted 404 | Contract proposed; no route | 2.1C2 after 2.1C1 |
| POST | `/organization-invitations/:token/reject` | Invitations | No tenant selection | Recipient binding | Authenticated recipient only | Redacted 404 | Contract proposed; no route | 2.1C2 after 2.1C1 |
| PATCH | `/organizations/:organizationId/memberships/:membershipId` | Memberships | Yes | Role/suspend/reactivate capability | Target must be same tenant and preserve owner invariant | 404 | Contract proposed; no route | 2.1C2 after 2.1C1 |
| DELETE | `/organizations/:organizationId/memberships/:membershipId` | Memberships | Yes | `membership.remove` or `membership.leave` | Explicit administrative remove vs self-leave | 404 | Contract proposed; no route | 2.1C2 after 2.1C1 |
| POST | `/case-files` | Case files | Target yes | `clinical.write` | Patient tenant + assignment | 404 | Legacy global/psychologist | 2.1D |
| GET | `/case-files` | Case files | Target yes | `clinical.read` | Tenant + assignment | Empty list | Legacy global/psychologist | 2.1D |
| GET | `/case-files/patient/:patientId` | Case files | Target yes | `clinical.read` | Patient tenant + assignment | 404 | Legacy global/psychologist | 2.1D |
| GET | `/case-files/:id` | Case files | Target yes | `clinical.read` | Case file tenant + assignment | 404 | Legacy global/psychologist | 2.1D |
| PATCH | `/case-files/:id` | Case files | Target yes | `clinical.write` | Case file tenant + assignment | 404 | Legacy global/psychologist | 2.1D |
| GET | `/case-files/:id/workspace` | Workspace | Target yes | `clinical.read`, `appointment.read`, `document.read` | All included relations scoped | 404 | Legacy global/psychologist | 2.1D |
| POST | `/session-notes` | Session notes | Target yes | `clinical.write` | Case file tenant + assignment | 404 | Legacy global/psychologist | 2.1D |
| GET | `/session-notes` | Session notes | Target yes | `clinical.read` | Tenant + assignment | Empty list | Legacy global/psychologist | 2.1D |
| GET | `/session-notes/case-file/:caseFileId` | Session notes | Target yes | `clinical.read` | Case file tenant + assignment | 404 | Legacy global/psychologist | 2.1D |
| GET | `/session-notes/:id` | Session notes | Target yes | `clinical.read` | Note tenant + assignment | 404 | Legacy global/psychologist | 2.1D |
| PATCH | `/session-notes/:id` | Session notes | Target yes | `clinical.write` | Note tenant + assignment | 404 | Legacy global/psychologist | 2.1D |
| DELETE | `/session-notes/:id` | Session notes | Target yes | `clinical.write` | Note tenant + assignment | 404 | Legacy global/psychologist | 2.1D |
| POST | `/documents/upload` | Documents | Target yes | `document.upload` | Case file tenant + assignment | 404 | Legacy global/psychologist | 2.1D |
| POST | `/documents` | Documents | Target yes | `document.upload` | Case file tenant + assignment | 404 | Legacy global/psychologist | 2.1D |
| GET | `/documents` | Documents | Target yes | `document.read` | Tenant + assignment | Empty list | Legacy global/psychologist | 2.1D |
| GET | `/documents/case-file/:caseFileId` | Documents | Target yes | `document.read` | Case file tenant + assignment | 404 | Legacy global/psychologist | 2.1D |
| GET | `/documents/:id` | Documents | Target yes | `document.read` | Document tenant + assignment | 404 | Legacy global/psychologist | 2.1D |
| GET | `/documents/:id/view` | Documents | Target yes | `document.read` | Metadata before filesystem | 404 | Legacy global/psychologist | 2.1D |
| GET | `/documents/:id/download` | Documents | Target yes | `document.read` | Metadata before filesystem | 404 | Legacy global/psychologist | 2.1D |
| PATCH | `/documents/:id` | Documents | Target yes | `document.upload` | Document tenant + assignment | 404 | Legacy global/psychologist | 2.1D |
| DELETE | `/documents/:id` | Documents | Target yes | `document.upload` | Document tenant + assignment | 404 | Legacy global/psychologist | 2.1D |
| POST | `/appointments` | Appointments | Target yes | `appointment.manage` | Patient/professional same tenant | 404/400 mismatch | Legacy global/psychologist | 2.1D |
| GET | `/appointments` | Appointments | Target yes | `appointment.read` | Tenant; field minimization | Empty list | Legacy global/psychologist | 2.1D |
| GET | `/appointments/patient/:patientId` | Appointments | Target yes | `appointment.read` | Patient tenant | 404 | Legacy global/psychologist | 2.1D |
| GET | `/appointments/:id` | Appointments | Target yes | `appointment.read` | Appointment tenant | 404 | Legacy global/psychologist | 2.1D |
| PATCH | `/appointments/:id` | Appointments | Target yes | `appointment.manage` | Tenant + relation consistency | 404/400 mismatch | Legacy global/psychologist | 2.1D |
| DELETE | `/appointments/:id` | Appointments | Target yes | `appointment.manage` | Appointment tenant | 404 | Legacy global/psychologist | 2.1D |
| POST | `/financial-transactions` | Finance | Target yes | `finance.manage` | Tenant; patient/appointment match | 404/400 mismatch | Legacy global/psychologist | 2.1D |
| GET | `/financial-transactions` | Finance | Target yes | `finance.read` | Tenant predicate | Empty list | Legacy global/psychologist | 2.1D |
| GET | `/financial-transactions/summary` | Finance/report | Target yes | `finance.read`, `report.read` | Tenant-scoped groupBy | Empty summary | Legacy global/psychologist | 2.1D |
| GET | `/financial-transactions/:id` | Finance | Target yes | `finance.read` | Transaction tenant | 404 | Legacy global/psychologist | 2.1D |
| PATCH | `/financial-transactions/:id` | Finance | Target yes | `finance.manage` | Tenant + relation consistency | 404/400 mismatch | Legacy global/psychologist | 2.1D |
| DELETE | `/financial-transactions/:id` | Finance | Target yes | `finance.manage` | Transaction tenant | 404 | Legacy global/psychologist | 2.1D |

No backend report-export or dashboard endpoint exists at this checkpoint. Frontend-composed reports remain in scope because every upstream API must become tenant-scoped before they are isolated.
