/**
 * Closed capability catalog derived from AUTHORIZATION_CAPABILITY_MATRIX.md.
 * Values are kept here, rather than in controllers, so policy changes have
 * one reviewable authority.
 */
export enum OrganizationCapability {
  ORGANIZATION_READ = 'organization.read',
  ORGANIZATION_MANAGE = 'organization.manage',
  MEMBERSHIP_READ = 'membership.read',
  MEMBERSHIP_INVITE = 'membership.invite',
  MEMBERSHIP_MANAGE_ROLE = 'membership.manage_role',
  MEMBERSHIP_SUSPEND = 'membership.suspend',
  PATIENT_READ = 'patient.read',
  PATIENT_CREATE = 'patient.create',
  PATIENT_UPDATE = 'patient.update',
  PATIENT_DELETE = 'patient.delete',
  CLINICAL_READ = 'clinical.read',
  CLINICAL_WRITE = 'clinical.write',
  DOCUMENT_READ = 'document.read',
  DOCUMENT_UPLOAD = 'document.upload',
  APPOINTMENT_READ = 'appointment.read',
  APPOINTMENT_MANAGE = 'appointment.manage',
  FINANCE_READ = 'finance.read',
  FINANCE_MANAGE = 'finance.manage',
  REPORT_READ = 'report.read',
  AUDIT_READ = 'audit.read',
}

export enum CapabilityDecision {
  ALLOW = 'ALLOW',
  CONDITIONAL = 'CONDITIONAL',
  DENY = 'DENY',
}
