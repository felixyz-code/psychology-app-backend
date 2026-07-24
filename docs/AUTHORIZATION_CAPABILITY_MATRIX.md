# Authorization Capability Matrix

`Allow` is unconditional inside the selected active organization. `Conditional` requires the stated condition. `Deny` is explicit. This is target policy; current runtime has not implemented these capabilities.

| Capability | OWNER | ADMIN | PSYCHOLOGIST | RECEPTIONIST | BILLING | AUDITOR | READ_ONLY | Condition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `organization.read` | Allow | Allow | Allow | Allow | Allow | Allow | Allow | Selected organization only |
| `organization.manage` | Allow | Deny | Deny | Deny | Deny | Deny | Deny | Owner-only |
| `membership.read` | Allow | Allow | Deny | Deny | Deny | Allow | Deny | Authorized API only |
| `membership.invite` | Allow | Allow | Deny | Deny | Deny | Deny | Deny | Cannot grant OWNER |
| `membership.manage_role` | Allow | Conditional | Deny | Deny | Deny | Deny | Deny | Admin cannot manage OWNER or grant above self |
| `membership.suspend` | Allow | Conditional | Deny | Deny | Deny | Deny | Deny | Admin cannot suspend OWNER |
| `patient.read` | Allow | Allow | Conditional | Deny | Deny | Conditional | Conditional | Psychologist assignment required; read roles need redaction policy |
| `patient.create` | Allow | Allow | Allow | Deny | Deny | Deny | Deny | Assignment/owner created consistently |
| `patient.update` | Allow | Allow | Conditional | Deny | Deny | Deny | Deny | Psychologist assignment required |
| `patient.delete` | Allow | Conditional | Deny | Deny | Deny | Deny | Deny | Admin needs owner-approved retention policy |
| `clinical.read` | Allow | Allow | Conditional | Deny | Deny | Conditional | Conditional | Assignment/redaction as applicable |
| `clinical.write` | Allow | Allow | Conditional | Deny | Deny | Deny | Deny | Psychologist assignment required |
| `document.read` | Allow | Allow | Conditional | Deny | Deny | Conditional | Conditional | Clinical scope/redaction |
| `document.upload` | Allow | Allow | Conditional | Deny | Deny | Deny | Deny | Assignment required for psychologist |
| `appointment.read` | Allow | Allow | Conditional | Allow | Deny | Conditional | Conditional | Receptionist sees operational fields only |
| `appointment.manage` | Allow | Allow | Conditional | Conditional | Deny | Deny | Deny | Receptionist cannot alter clinical notes/assignment |
| `finance.read` | Allow | Allow | Deny | Deny | Allow | Conditional | Deny | Auditor is read-only |
| `finance.manage` | Allow | Allow | Deny | Deny | Allow | Deny | Deny | Organization-scoped only |
| `report.read` | Allow | Allow | Conditional | Conditional | Conditional | Conditional | Conditional | Capability/redaction scoped |
| `audit.read` | Allow | Deny | Deny | Deny | Deny | Allow | Deny | Metadata only |

No role grants platform-wide access, tenant switching without membership, cross-tenant access, or authority through a DTO/body/query organization ID. Assignments never grant organization management or finance access. Until a redaction policy is approved, AUDITOR and READ_ONLY clinical entries remain disabled in implementation.

## POST-GO-LIVE.2.1D0 clinical and financial target

`POST_GO_LIVE_2_1D0_TENANT_CONVERSION_CONTRACT.md` is the normative matrix for
the 2.1D module conversion. It supersedes the older broad target interpretation
for clinical and document access. A role can be eligible for a capability, but
clinical content is returned only when the actor also has a valid assignment to
the patient in the selected organization.

The target 2.1D capability vocabulary is domain-specific and default-deny. It
may be added in D1 through D3 without changing this D0 documentation task:

| Domain | Capabilities |
| --- | --- |
| Patients | `patient.read`, `patient.create`, `patient.update`, `patient.delete`, `patient.assign` |
| Case files | `case_file.read`, `case_file.create`, `case_file.update` |
| Workspace | `workspace.read` |
| Session notes | `session_note.read`, `session_note.create`, `session_note.update`, `session_note.delete` |
| Documents | `document.metadata_read`, `document.upload`, `document.download`, `document.update`, `document.delete` |
| Appointments | `appointment.read`, `appointment.manage` |
| Finance | `finance.read`, `finance.manage`, `finance.summary_read` |

`OWNER` and `ADMIN` do not receive clinical-content access by role alone.
`AUDITOR` and `READ_ONLY` receive no clinical content, session notes, document
downloads, or partial clinical redaction during 2.1D. Unknown capabilities and
conditional capabilities without a module policy remain denied.

## POST-GO-LIVE.2.1C0 approved contract — invitation and membership mutations

This table is an approved 2.1C0 contract, not a runtime grant. The typed catalog
and APIs must not add or use these capabilities until 2.1C1 and 2.1C2 are
explicitly approved. `SELF_ONLY` is an object-level restriction, never a role
grant. `CONDITIONAL` requires the target to be non-OWNER and no more privileged
than the actor. Every mutation remains subject to the last-active-OWNER
invariant. Unlisted or ambiguous capabilities remain DENY.

| Capability | OWNER | ADMIN | PSYCHOLOGIST | RECEPTIONIST | BILLING | AUDITOR | READ_ONLY |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `invitation.read` | ALLOW | ALLOW | DENY | DENY | DENY | DENY | DENY |
| `invitation.create` | ALLOW | ALLOW | DENY | DENY | DENY | DENY | DENY |
| `invitation.revoke` | ALLOW | DENY | DENY | DENY | DENY | DENY | DENY |
| `membership.read` | ALLOW | ALLOW | DENY | DENY | DENY | ALLOW | DENY |
| `membership.change_role` | ALLOW | CONDITIONAL | DENY | DENY | DENY | DENY | DENY |
| `membership.suspend` | ALLOW | CONDITIONAL | DENY | DENY | DENY | DENY | DENY |
| `membership.reactivate` | ALLOW | CONDITIONAL | DENY | DENY | DENY | DENY | DENY |
| `membership.remove` | ALLOW | CONDITIONAL | DENY | DENY | DENY | DENY | DENY |
| `membership.leave` | SELF_ONLY | SELF_ONLY | SELF_ONLY | SELF_ONLY | SELF_ONLY | SELF_ONLY | SELF_ONLY |
| `membership.transfer_ownership` | DENY | DENY | DENY | DENY | DENY | DENY | DENY |

ADMIN may create invitations and administer a non-OWNER membership, but may not
promote, degrade, suspend, remove, or otherwise mutate an OWNER; ADMIN may not
self-elevate or grant a privilege above its own. Invitation revocation remains
OWNER-only because it was not granted to ADMIN. AUDITOR may read memberships
only through a sanitized projection with no complete email or clinical data. A
rejected invitation is terminal and not reusable, but a new invitation to the
same normalized email is allowed after rejection. No invite may grant OWNER and
ownership transfer is outside the MVP. These entries do not change the existing
typed catalog or its 2.1B resolver until 2.1C2 follows the required schema
phase.

## POST-GO-LIVE.2.1C2 runtime mapping

2.1C2 implements the invitation entries above as `invitation.read`,
`invitation.create`, and `invitation.revoke`, and the membership entries as
`membership.manage_role`, `membership.suspend`, `membership.reactivate`, and
`membership.remove`. Conditional ADMIN operations are enforced by the
organization service after central resolution: the target must be non-OWNER,
the actor cannot target themself, and a new role cannot outrank ADMIN.
