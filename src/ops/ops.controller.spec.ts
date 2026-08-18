import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { OpsController } from './ops.controller';
import { OrphanReconciliationService } from './orphan-reconciliation.service';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { SKIP_TENANT_CONTEXT_KEY } from '../tenant-context/tenant-context.constants';
import { AUDIT_LOG_METADATA_KEY } from '../audit-logs/audit-logs.constants';
import { AuditLogMetadataOptions } from '../audit-logs/audit-logs.types';

describe('OpsController', () => {
  let controller: OpsController;
  let service: {
    reconcileUploads: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      reconcileUploads: jest.fn().mockResolvedValue({
        scannedAt: new Date(),
        dryRun: true,
        summary: {
          totalDbRecords: 0,
          totalDiskFiles: 0,
          orphanCount: 0,
          ghostCount: 0,
          reconciledOrphans: 0,
          reconciledGhosts: 0,
        },
        orphans: [],
        ghosts: [],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OpsController],
      providers: [{ provide: OrphanReconciliationService, useValue: service }],
    }).compile();

    controller = module.get<OpsController>(OpsController);
  });

  it('delegates to OrphanReconciliationService with default dryRun true when dto is omitted', async () => {
    await controller.reconcileUploads({});
    expect(service.reconcileUploads).toHaveBeenCalledWith(true);
  });

  it('delegates to OrphanReconciliationService with dryRun false when specified', async () => {
    await controller.reconcileUploads({ dryRun: false });
    expect(service.reconcileUploads).toHaveBeenCalledWith(false);
  });

  it('has security metadata enforcing ADMIN role and bypassing tenant context', () => {
    const isTenantSkipped = Reflect.getMetadata(
      SKIP_TENANT_CONTEXT_KEY,
      OpsController,
    ) as boolean;
    expect(isTenantSkipped).toBe(true);

    const descriptor = Object.getOwnPropertyDescriptor(
      OpsController.prototype,
      'reconcileUploads',
    );

    const roles = Reflect.getMetadata(
      ROLES_KEY,
      descriptor?.value as object,
    ) as UserRole[];
    expect(roles).toEqual([UserRole.ADMIN]);

    const auditLogMetadata = Reflect.getMetadata(
      AUDIT_LOG_METADATA_KEY,
      descriptor?.value as object,
    ) as AuditLogMetadataOptions;
    expect(auditLogMetadata).toEqual({
      action: 'OPS_UPLOADS_RECONCILIATION',
      resourceType: 'StorageVolume',
    });
  });
});
