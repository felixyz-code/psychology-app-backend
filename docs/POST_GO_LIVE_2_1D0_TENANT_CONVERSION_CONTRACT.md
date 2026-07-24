# POST-GO-LIVE.2.1D0 Tenant Conversion Contract

## Status and scope

Status: Approved documentation contract for POST-GO-LIVE.2.1D.

This document is the normative source for the clinical and financial tenant
conversion plan. It defines the future D1 through D4 implementation contract
only. It does not change runtime behavior, Prisma schema, migrations, seed
data, production data, frontend behavior, deployments, or the current typed
capability catalog.

## Sources reviewed

This contract aligns with:

* `docs/API.md`
* `docs/ARCHITECTURE.md`
* `docs/DATA_MODEL.md`
* `docs/ROADMAP.md`
* `docs/DECISION_LOG.md`
* `docs/CHANGELOG.md`
* `docs/AUTHORIZATION_CONTRACT.md`
* `docs/AUTHORIZATION_CAPABILITY_MATRIX.md`
* `docs/TENANT_ENDPOINT_SCOPE_MATRIX.md`
* `docs/TENANT_SECURITY_TEST_CONTRACT.md`
* `docs/adr/ADR-TENANT-DATA-ISOLATION.md`
* Current controllers and services for Patients, Case Files, Workspace,
  Session Notes, Documents, Appointments, Financial Transactions, and
  Financial Summary.

## Approved authorization decision

Each `OrganizationMembership` has exactly one organizational role. The current
membership role names are:

* `OWNER`
* `ADMIN`
* `PSYCHOLOGIST`
* `RECEPTIONIST`
* `BILLING`
* `AUDITOR`
* `READ_ONLY`

Roles are not cumulative. The backend must not store combinations such as
`OWNER + ADMIN + PSYCHOLOGIST`. Combined responsibility is represented through
all of the following:

* one organizational role;
* explicit capabilities;
* clinical assignment where clinical content is involved.

The organizational role describes authority inside the selected organization.
It is not a clinical-access shortcut.

## Freelancer OWNER flow

For the initial single-psychologist organization, the expected operating model
is:

```text
Organizational role: OWNER
Capabilities: approved administrative, operational, clinical, and financial
Assignment: the OWNER's own patients
```

This lets the freelancer administer the organization, invitations, future
memberships, patients, assignments, case files, session notes, documents,
appointments, and finances without storing more than one role.

Organization bootstrap remains governed by the approved organization-domain
flow; D0 does not add a new organization-create endpoint. The D1 through D4
implementation must not make a single-user tenant impossible: once the
organization is provisioned or created by the approved flow, the freelancer can
hold the active `OWNER` membership and operate through capabilities plus
assignment.

Patient creation must remain explicit and auditable. The preferred D1 contract
is server-validated self-assignment: the create DTO still does not accept
`organizationId`; if the endpoint accepts or derives a clinical professional,
the server validates that the target membership belongs to the resolved tenant,
has the required clinical capability, and is eligible for assignment. A
server-side autoassignment rule may be used only for the single eligible
clinical professional case and must be documented in the endpoint contract and
tests.

## Central clinical rule

Clinical content access requires all of the following at the same time:

```text
valid tenant context
+ active membership
+ active organization
+ explicit clinical capability
+ valid clinical assignment
```

`organizationId` is the main isolation boundary. The legacy `psychologistId`
remains a temporary additional assignment restriction during conversion; it is
never a tenant boundary and never broadens tenant scope.

There must be no rule equivalent to `OWNER can read all case files` or `ADMIN
can read clinical data because they are an administrator`.

## Assignment policy

The assignment policy for 2.1D is hybrid and restrictive:

* The assigned clinical professional may access the patient's clinical content
  when they also have the required clinical capability.
* The assignment, patient, membership, and organization must all belong to the
  same `organizationId`.
* Another clinical professional in the same tenant does not automatically gain
  access.
* Assignment changes require an explicit assignment capability.
* `OWNER` and `ADMIN` may administer assignment only when granted the approved
  assignment capability.
* Administering assignment does not grant retrospective clinical-content access.
* Assignment is not inferred from organizational role.
* Tenant is not inferred only from `psychologistId`.
* A patient is not automatically assigned to every `OWNER`.

## Capability policy

Capabilities are explicit, typed by domain, and default-deny. The runtime
catalog remains unchanged in D0; D1 through D3 may add the following target
capabilities or equivalent names that preserve the existing `domain.action`
format:

| Domain | Target capabilities |
| --- | --- |
| Organization | `organization.read`, `organization.manage` |
| Memberships | `membership.read`, `membership.invite`, `membership.manage_role`, `membership.suspend`, `membership.reactivate`, `membership.remove`, `membership.leave` |
| Patients | `patient.read`, `patient.create`, `patient.update`, `patient.delete`, `patient.assign` |
| Case files | `case_file.read`, `case_file.create`, `case_file.update` |
| Workspace | `workspace.read` |
| Session notes | `session_note.read`, `session_note.create`, `session_note.update`, `session_note.delete` |
| Documents | `document.metadata_read`, `document.upload`, `document.download`, `document.update`, `document.delete` |
| Appointments | `appointment.read`, `appointment.manage` |
| Finance | `finance.read`, `finance.manage`, `finance.summary_read` |
| Audit | `audit.read` |

The existing broader `clinical.read`, `clinical.write`, `document.read`, and
`report.read` target capabilities must not be treated as permission to bypass
the D0 assignment and projection rules. If retained during implementation, they
must be narrowed or wrapped by module-specific policy before becoming runtime
grants.

Unknown, misspelled, ambiguous, conditional, or unlisted capabilities resolve
to deny.

## Role matrix

This table distinguishes role eligibility from final capability checks.
`Conditional` means a capability plus resource policy is still required.

| Role | Organization | Memberships | Assignment | Clinical metadata | Clinical content | Appointments | Finances | Documents |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `OWNER` | Allow with capability | Allow with capability | Manage with capability | Conditional | Conditional, requires assignment | Allow with capability | Allow with capability | Conditional, requires assignment for clinical files |
| `ADMIN` | Read/manage only if granted | Non-OWNER administration only as approved by C2 | Manage with capability | Conditional | Deny unless separately clinically capable and assigned | Allow with capability | Allow with capability | Deny unless clinically capable and assigned |
| `PSYCHOLOGIST` | Read selected organization | Self leave only for membership lifecycle | Assigned patients only | Conditional | Conditional, requires assignment | Conditional | Deny unless financial capability is granted | Conditional, requires assignment |
| `RECEPTIONIST` | Read selected organization | Self leave only | Deny | Operational appointment metadata only if approved | Deny | Conditional operational access | Deny | Deny |
| `BILLING` | Read selected organization | Self leave only | Deny | Deny | Deny | Deny unless future operational policy allows | Allow with finance capability | Deny |
| `AUDITOR` | Sanitized read with capability | Sanitized membership read with capability | Deny | Deny in 2.1D | Deny in 2.1D | Deny unless future explicit policy | Deny in 2.1D unless future policy | Deny |
| `READ_ONLY` | Read selected organization | Self leave only | Deny | Deny in 2.1D | Deny in 2.1D | Deny unless future explicit policy | Deny | Deny |

During 2.1D, `AUDITOR` and `READ_ONLY` receive no clinical notes, document
content, document downloads, diagnoses, treatment plans, or partial clinical
redactions.

## Module operation matrix

All rows require a valid tenant context unless explicitly stated otherwise.
Cross-tenant direct resource access returns redacted `404`. Cross-tenant lists
return an empty result set or omit foreign rows. Visible in-tenant actions
without a capability return `403`.

| Module | Operation | Capability | Tenant required | Assignment required | Cross-tenant result |
| --- | --- | --- | --- | --- | --- |
| Patients | list/search assigned clinical view | `patient.read` | Yes | Yes for clinical fields | Empty list |
| Patients | list/search operational projection | `patient.read` | Yes | No only for explicitly approved metadata | Empty list |
| Patients | detail clinical view | `patient.read` | Yes | Yes | `404` |
| Patients | create | `patient.create` | Yes | Creates or validates assignment | `404` for foreign relations |
| Patients | update demographics/metadata | `patient.update` | Yes | Yes unless approved operational metadata | `404` |
| Patients | delete | `patient.delete` | Yes | Policy defined in D1 | `404` |
| Patients | assign/reassign | `patient.assign` | Yes | Actor need not receive clinical read | `404` |
| Patients | relationships | operation capability | Yes | Matches target projection | `404` |
| Patients | sensitive content | `patient.read` plus clinical policy | Yes | Yes | `404` |
| Case Files | create | `case_file.create` | Yes | Yes for patient | `404` |
| Case Files | list | `case_file.read` | Yes | Yes | Empty list |
| Case Files | by patient | `case_file.read` | Yes | Yes | `404` |
| Case Files | detail | `case_file.read` | Yes | Yes | `404` |
| Case Files | update diagnosis/treatment plan | `case_file.update` | Yes | Yes | `404` |
| Workspace | get aggregate | `workspace.read` plus included capabilities | Yes | Yes | `404` |
| Workspace | missing case file | `workspace.read` | Yes | Yes | `404` |
| Session Notes | list | `session_note.read` | Yes | Yes | Empty list |
| Session Notes | list by case file | `session_note.read` | Yes | Yes | `404` |
| Session Notes | detail | `session_note.read` | Yes | Yes | `404` |
| Session Notes | create | `session_note.create` | Yes | Yes | `404` |
| Session Notes | update | `session_note.update` | Yes | Yes | `404` |
| Session Notes | delete | `session_note.delete` | Yes | Yes | `404` |
| Session Notes | historical content | `session_note.read` | Yes | Yes | `404` |
| Documents | list metadata | `document.metadata_read` | Yes | Yes for clinical files | Empty list |
| Documents | metadata detail | `document.metadata_read` | Yes | Yes | `404` |
| Documents | upload file and metadata | `document.upload` | Yes | Yes | `404` |
| Documents | create metadata only | `document.upload` | Yes | Yes | `404` |
| Documents | download | `document.download` | Yes | Yes | `404`; file not opened |
| Documents | inline view | `document.download` | Yes | Yes | `404`; file not opened |
| Documents | update metadata | `document.update` | Yes | Yes | `404` |
| Documents | delete metadata | `document.delete` | Yes | Yes | `404` |
| Appointments | list/calendar/daily agenda | `appointment.read` | Yes | No for operational projection; yes for clinical notes | Empty list |
| Appointments | patient appointments | `appointment.read` | Yes | Assignment required for clinical patient view | `404` |
| Appointments | detail | `appointment.read` | Yes | Depends on projection | `404` |
| Appointments | create | `appointment.manage` | Yes | No for operational scheduling; relationships tenant-scoped | `404` or `400` for visible mismatch |
| Appointments | update/cancel/delete | `appointment.manage` | Yes | Depends on clinical fields touched | `404` or `400` for visible mismatch |
| Financial Transactions | list/filter/detail | `finance.read` | Yes | No | Empty list or `404` |
| Financial Transactions | create/update/delete | `finance.manage` | Yes | No; patient/appointment relations scoped | `404` or `400` for visible mismatch |
| Financial Transactions | export if added | `finance.read` | Yes | No | Empty export |
| Financial Summary | income/expense/balance/counts | `finance.summary_read` | Yes | No | Empty summary |
| Financial Summary | ranges/categories/groupings | `finance.summary_read` | Yes | No | Empty summary |

Financial access is controlled by financial capabilities. Clinical assignment
alone never grants financial access. Every financial aggregate query must carry
`organizationId`.

Document file access is authorized through tenant-aware metadata before any
physical blob or filesystem path is opened. A known, guessed, or manipulated
storage key never grants access without authorized metadata in the selected
tenant and required assignment.

## Legacy `organizationId = null`

Tenant-aware endpoints must treat null organization rows as inaccessible:

* not visible in lists or searches;
* not counted or summarized;
* not returned by direct ID;
* not mutable;
* not linkable to tenant-aware resources;
* not implicitly assigned to the selected tenant;
* not recovered through `psychologistId`;
* not included through `organizationId = currentTenant OR organizationId IS NULL`.

Legacy null rows require a separate certified backfill. Tenant inference from
legacy owner identity is prohibited in request-time authorization.

## Intra-tenant relationship validation

Every relation must be validated with tenant-scoped reads or conditional
mutations. Valid relationships require every linked resource to share the same
`organizationId`:

* Organization to Patient
* Patient to CaseFile
* Patient to SessionNote through CaseFile
* Patient to Document through CaseFile
* Patient to Appointment
* Patient to FinancialTransaction
* Appointment to FinancialTransaction
* Psychologist or membership to Patient
* Psychologist or membership to Appointment

Mutation implementations should prefer database-conditional writes over a
global ID read followed by in-memory comparison.

## HTTP contract

Tenant-converted endpoints use:

| Condition | Response |
| --- | --- |
| Missing, invalid, or expired JWT | `401` |
| Malformed or repeated tenant selector | `400` |
| Missing tenant where several active memberships exist | `409` |
| No active membership or inactive organization | redacted `403` |
| Known in-tenant action without capability | `403` |
| Missing assignment for visible clinical resource | `403` if resource visibility is already established, otherwise `404` |
| Resource missing or cross-tenant | redacted `404` |
| Cross-tenant relation ID | redacted `404` |
| Two visible but incompatible relation IDs | `400` |
| Business invariant conflict | `409` |

DTOs must not accept `organizationId`. Current routes remain compatible unless
a documented incompatibility is approved later. Pagination, filters, sorting,
and projections must be explicit per endpoint and must not leak foreign
resource existence.

## Projections and redaction

No `AUDITOR` or `READ_ONLY` clinical redaction is implemented in 2.1D.

Projection classes:

| Projection | Allowed fields | Excluded fields |
| --- | --- | --- |
| Operational metadata | technical IDs, dates, status, counters, non-clinical scheduling fields | notes, diagnosis, treatment plan, document content, sensitive demographics unless approved |
| Personal data | patient name, contact, birth date | clinical notes, diagnosis, treatment plan, document content |
| Clinical content | diagnosis, treatment plan, session-note title/content, clinical appointment notes | unavailable without clinical capability and assignment |
| Financial content | amount, currency, concept, category, payment status, method, ranges, counts | clinical content unless separately authorized |
| File content | physical blob stream, download, inline view | unavailable until metadata authorization succeeds |

Administrative views may receive only explicitly approved operational metadata.
They do not include notes, diagnoses, document contents, sensitive filenames, or
clinical free text.

## Sanitized observability

Allowed security and policy events may contain:

* action;
* outcome;
* reasonCode;
* correlationId;
* technical userId;
* technical organizationId;
* technical resourceId;
* evaluated capability.

They must not contain patient names, emails, phone numbers, addresses,
diagnoses, clinical notes, document contents, sensitive filenames, DTO bodies,
JWTs, authorization headers, hashes, SQL, Prisma internals, stack traces in
responses, or file paths that reveal personal or clinical information.

Denial logs must not reveal whether a cross-tenant resource exists.

## Approved implementation order

### D1 - Patients and minimal reusable base

Align Patients with role plus capabilities plus assignment, remove legacy
bypasses, keep helpers small and explicit, certify null organization rows as
inaccessible, and validate the freelancer OWNER self-assignment flow.

### D2 - Case Files, Workspace, Session Notes, and Documents

Convert the clinical core, protect content and files, validate relationships,
certify blob access through metadata authorization first, and prevent indirect
enumeration.

### D3 - Appointments and Financial Transactions/Summary

Convert operational scheduling and finance, separate clinical access from
financial capabilities, protect aggregates, and certify filters and relations.

### D4 - Integration and final certification

Complete contracts, OpenAPI, PostgreSQL integration, E2E, observability,
regression, and CI certification.

### D-M - Merge and closure

Perform final review, controlled merge, development synchronization, and
POST-GO-LIVE.2.1D closure.

No phase may introduce a global Prisma middleware or broad global abstraction
before the converted modules prove the local policy shape.

## Test gates

Each converted module must cover:

* missing tenant context;
* invalid tenant context;
* actor without membership;
* suspended membership;
* inactive or suspended organization;
* missing capability;
* unknown capability;
* actor from another tenant;
* missing ID;
* cross-tenant ID;
* list with two tenants;
* cross-tenant mutation;
* cross-tenant relation;
* missing assignment;
* assignment from another tenant;
* legacy `organizationId = null`;
* sanitized projection;
* sanitized logs.

Freelancer scenarios must cover a single `OWNER` creating a patient, being
assigned to that patient, reading workspace, creating a note, uploading or
managing a document, administering an appointment, recording a transaction, and
operating through capabilities plus assignment without accumulated roles.

Document scenarios must cover cross-tenant metadata, cross-tenant download,
manipulated storage key, missing blob, metadata without blob, blob without valid
metadata, and no sensitive filename in logs.

Financial Summary scenarios must cover two tenants in one database, legacy null
rows, date ranges, categories, income, expenses, balance, counts, and zero
tenant mixing.

## Out of scope

This D0 contract does not authorize D1 implementation, frontend changes,
production access, deployments, migrations, Prisma schema changes, capability
runtime enum changes, global Prisma middleware, redacted clinical access for
`AUDITOR` or `READ_ONLY`, platform administrator bypasses, billing SaaS,
patient portal behavior, or merge to `development`.
