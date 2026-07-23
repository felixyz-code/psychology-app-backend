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

## POST-GO-LIVE.2.1C0 proposal — invitation and membership mutations

This table is a contract proposal, not a runtime grant. `REQUIRES_PRODUCT_DECISION`
is intentionally fail-closed: the typed catalog and APIs must not add or use the
capability until the listed product decision is approved. `SELF_ONLY` is an
object-level restriction, never a role grant. `CONDITIONAL` requires the target
to be non-OWNER and no more privileged than the actor; ADMIN-on-ADMIN mutation
is separately pending product approval. Every mutation remains subject to the
last-active-OWNER invariant.

| Capability | OWNER | ADMIN | PSYCHOLOGIST | RECEPTIONIST | BILLING | AUDITOR | READ_ONLY |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `invitation.read` | ALLOW | ALLOW | DENY | DENY | DENY | REQUIRES_PRODUCT_DECISION | DENY |
| `invitation.create` | ALLOW | REQUIRES_PRODUCT_DECISION | DENY | DENY | DENY | DENY | DENY |
| `invitation.revoke` | ALLOW | REQUIRES_PRODUCT_DECISION | DENY | DENY | DENY | DENY | DENY |
| `membership.read` | ALLOW | ALLOW | DENY | DENY | DENY | REQUIRES_PRODUCT_DECISION | DENY |
| `membership.change_role` | ALLOW | CONDITIONAL | DENY | DENY | DENY | DENY | DENY |
| `membership.suspend` | ALLOW | CONDITIONAL | DENY | DENY | DENY | DENY | DENY |
| `membership.reactivate` | ALLOW | CONDITIONAL | DENY | DENY | DENY | DENY | DENY |
| `membership.remove` | OWNER_ONLY | DENY | DENY | DENY | DENY | DENY | DENY |
| `membership.leave` | SELF_ONLY | SELF_ONLY | SELF_ONLY | SELF_ONLY | SELF_ONLY | SELF_ONLY | SELF_ONLY |
| `membership.transfer_ownership` | REQUIRES_PRODUCT_DECISION | DENY | DENY | DENY | DENY | DENY | DENY |

The proposed conservative defaults are: only an OWNER may remove a membership;
ADMIN invitation/revocation and membership-identity visibility for AUDITOR need
product approval; no non-owner may grant, modify, suspend, reactivate, remove,
or transfer an OWNER. No invite may grant OWNER. These rows supersede neither
the existing typed catalog nor its 2.1B resolver until 2.1C2 is explicitly
approved after the required schema phase.
