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
  MEMBERSHIP_REACTIVATE = 'membership.reactivate',
  MEMBERSHIP_REMOVE = 'membership.remove',
  MEMBERSHIP_LEAVE = 'membership.leave',
  INVITATION_READ = 'invitation.read',
  INVITATION_CREATE = 'invitation.create',
  INVITATION_REVOKE = 'invitation.revoke',
  PATIENT_READ = 'patient.read',
  PATIENT_CREATE = 'patient.create',
  PATIENT_UPDATE = 'patient.update',
  PATIENT_DELETE = 'patient.delete',
  CASE_FILE_READ = 'case_file.read',
  CASE_FILE_CREATE = 'case_file.create',
  CASE_FILE_UPDATE = 'case_file.update',
  WORKSPACE_READ = 'workspace.read',
  SESSION_NOTE_READ = 'session_note.read',
  SESSION_NOTE_CREATE = 'session_note.create',
  SESSION_NOTE_UPDATE = 'session_note.update',
  SESSION_NOTE_DELETE = 'session_note.delete',
  CLINICAL_READ = 'clinical.read',
  CLINICAL_WRITE = 'clinical.write',
  DOCUMENT_METADATA_READ = 'document.metadata_read',
  DOCUMENT_READ = 'document.read',
  DOCUMENT_UPLOAD = 'document.upload',
  DOCUMENT_DOWNLOAD = 'document.download',
  DOCUMENT_UPDATE = 'document.update',
  DOCUMENT_DELETE = 'document.delete',
  APPOINTMENT_READ = 'appointment.read',
  APPOINTMENT_MANAGE = 'appointment.manage',
  FINANCE_READ = 'finance.read',
  FINANCE_MANAGE = 'finance.manage',
  FINANCE_SUMMARY_READ = 'finance.summary_read',
  REPORT_READ = 'report.read',
  AUDIT_READ = 'audit.read',
}

export enum CapabilityDecision {
  ALLOW = 'ALLOW',
  CONDITIONAL = 'CONDITIONAL',
  DENY = 'DENY',
}
