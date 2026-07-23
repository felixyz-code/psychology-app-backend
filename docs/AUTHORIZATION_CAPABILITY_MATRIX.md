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
