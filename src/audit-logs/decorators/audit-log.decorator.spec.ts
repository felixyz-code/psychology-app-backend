import { AuditLog } from './audit-log.decorator';
import { AUDIT_LOG_METADATA_KEY } from '../audit-logs.constants';
import { AuditLogMetadataOptions } from '../audit-logs.types';

describe('@AuditLog decorator', () => {
  it('attaches metadata when passed object options', () => {
    class TestController {
      @AuditLog({ action: 'UPDATE_ORG', resourceType: 'Organization' })
      testMethod() {}
    }

    const descriptor = Object.getOwnPropertyDescriptor(
      TestController.prototype,
      'testMethod',
    );

    const metadata = Reflect.getMetadata(
      AUDIT_LOG_METADATA_KEY,
      descriptor?.value as object,
    ) as AuditLogMetadataOptions;

    expect(metadata).toEqual({
      action: 'UPDATE_ORG',
      resourceType: 'Organization',
    });
  });

  it('attaches metadata when passed positional arguments', () => {
    class TestController {
      @AuditLog('CHANGE_ROLE', 'OrganizationMembership')
      testMethod() {}
    }

    const descriptor = Object.getOwnPropertyDescriptor(
      TestController.prototype,
      'testMethod',
    );

    const metadata = Reflect.getMetadata(
      AUDIT_LOG_METADATA_KEY,
      descriptor?.value as object,
    ) as AuditLogMetadataOptions;

    expect(metadata).toEqual({
      action: 'CHANGE_ROLE',
      resourceType: 'OrganizationMembership',
    });
  });
});
