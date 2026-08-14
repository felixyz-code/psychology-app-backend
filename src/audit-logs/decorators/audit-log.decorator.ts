import { SetMetadata } from '@nestjs/common';
import { AUDIT_LOG_METADATA_KEY } from '../audit-logs.constants';
import { AuditLogMetadataOptions } from '../audit-logs.types';

export function AuditLog(
  options: AuditLogMetadataOptions,
): MethodDecorator & ClassDecorator;
export function AuditLog(
  action: string,
  resourceType: string,
): MethodDecorator & ClassDecorator;
export function AuditLog(
  actionOrOptions: string | AuditLogMetadataOptions,
  resourceType?: string,
): MethodDecorator & ClassDecorator {
  const metadata: AuditLogMetadataOptions =
    typeof actionOrOptions === 'string'
      ? { action: actionOrOptions, resourceType: resourceType ?? 'Unknown' }
      : actionOrOptions;

  return SetMetadata(AUDIT_LOG_METADATA_KEY, metadata);
}
