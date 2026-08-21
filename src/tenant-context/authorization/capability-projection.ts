import { MembershipRole, OrganizationStatus } from '@prisma/client';
import { CapabilityResolverService } from './capability-resolver.service';

const AUTH_CONTEXT_CAPABILITY_CATALOG = new Set([
  'appointment.manage',
  'appointment.read',
  'assessment.template_manage',
  'audit.read',
  'case_file.create',
  'case_file.read',
  'case_file.update',
  'document.delete',
  'document.download',
  'document.metadata_read',
  'document.update',
  'document.upload',
  'finance.manage',
  'finance.read',
  'finance.summary_read',
  'invitation.create',
  'invitation.read',
  'invitation.resend',
  'invitation.revoke',
  'membership.leave',
  'membership.manage_role',
  'membership.read',
  'membership.reactivate',
  'membership.remove',
  'membership.suspend',
  'organization.manage',
  'organization.read',
  'ownership.transfer',
  'patient.create',
  'patient.delete',
  'patient.read',
  'patient.update',
  'report.read',
  'session_note.create',
  'session_note.delete',
  'session_note.read',
  'session_note.update',
  'workspace.read',
]);

const ADMIN_SUSPENDED_CAPABILITIES = new Set([
  'invitation.create',
  'invitation.read',
  'invitation.resend',
  'invitation.revoke',
  'organization.manage',
  'organization.read',
  'ownership.transfer',
]);

export function projectAuthContextCapabilities(
  role: MembershipRole,
  organizationStatus: OrganizationStatus,
  resolver: CapabilityResolverService,
): string[] {
  const capabilities = resolver
    .getUnconditionalCapabilities(role)
    .filter((capability) => AUTH_CONTEXT_CAPABILITY_CATALOG.has(capability));

  const projected =
    organizationStatus === OrganizationStatus.SUSPENDED
      ? capabilities.filter((capability) =>
          ADMIN_SUSPENDED_CAPABILITIES.has(capability),
        )
      : capabilities;

  return [...new Set(projected)].sort();
}

export const AUTH_CONTEXT_CAPABILITIES = Object.freeze(
  [...AUTH_CONTEXT_CAPABILITY_CATALOG].sort(),
);
