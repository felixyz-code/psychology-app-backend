import { Test, TestingModule } from '@nestjs/testing';
import type { Dirent, Stats } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { resolve } from 'node:path';
import { AppConfigService } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { OrphanReconciliationService } from './orphan-reconciliation.service';

jest.mock('node:fs/promises');

function createMockDirent(name: string, isDirectory: boolean): Dirent {
  return {
    name,
    parentPath: '',
    path: '',
    isDirectory: () => isDirectory,
    isFile: () => !isDirectory,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false,
  } as Dirent;
}

function createMockStats(size: number): Stats {
  return {
    size,
    isFile: () => true,
    isDirectory: () => false,
  } as Stats;
}

describe('OrphanReconciliationService', () => {
  let service: OrphanReconciliationService;
  let prisma: {
    organizationLogoAsset: {
      findMany: jest.Mock;
      delete: jest.Mock;
    };
  };
  let config: {
    uploadsPath: string;
  };

  const mockFs = fsPromises as jest.Mocked<typeof fsPromises>;

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma = {
      organizationLogoAsset: {
        findMany: jest.fn(),
        delete: jest.fn(),
      },
    };

    config = {
      uploadsPath: '/mock/uploads',
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrphanReconciliationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AppConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<OrphanReconciliationService>(
      OrphanReconciliationService,
    );
  });

  it('detects a completely synchronized state (0 orphans, 0 ghosts)', async () => {
    prisma.organizationLogoAsset.findMany.mockResolvedValue([
      {
        organizationId: 'org-1',
        storageKey: 'organizations/org-1/logo-1.png',
      },
    ]);

    mockFs.access.mockResolvedValue(undefined);
    mockFs.readdir
      .mockResolvedValueOnce([createMockDirent('org-1', true)] as never)
      .mockResolvedValueOnce([createMockDirent('logo-1.png', false)] as never);

    mockFs.stat.mockResolvedValue(createMockStats(1024));

    const report = await service.reconcileUploads(true);

    expect(report.dryRun).toBe(true);
    expect(report.summary.totalDbRecords).toBe(1);
    expect(report.summary.totalDiskFiles).toBe(1);
    expect(report.summary.orphanCount).toBe(0);
    expect(report.summary.ghostCount).toBe(0);
    expect(report.orphans).toHaveLength(0);
    expect(report.ghosts).toHaveLength(0);
    expect(mockFs.unlink).not.toHaveBeenCalled();
    expect(prisma.organizationLogoAsset.delete).not.toHaveBeenCalled();
  });

  it('identifies orphan files on disk without DB records and reports them in dryRun mode', async () => {
    prisma.organizationLogoAsset.findMany.mockResolvedValue([]);

    mockFs.access.mockResolvedValue(undefined);
    mockFs.readdir
      .mockResolvedValueOnce([createMockDirent('org-orphan', true)] as never)
      .mockResolvedValueOnce([
        createMockDirent('untracked-logo.png', false),
      ] as never);

    mockFs.stat.mockResolvedValue(createMockStats(2048));

    const report = await service.reconcileUploads(true);

    expect(report.summary.orphanCount).toBe(1);
    expect(report.summary.ghostCount).toBe(0);
    expect(report.orphans[0].storageKey).toBe(
      'organizations/org-orphan/untracked-logo.png',
    );
    expect(report.orphans[0].sizeBytes).toBe(2048);
    expect(report.orphans[0].reconciled).toBe(false);
    expect(mockFs.unlink).not.toHaveBeenCalled();
  });

  it('deletes orphan files from disk when dryRun is false', async () => {
    prisma.organizationLogoAsset.findMany.mockResolvedValue([]);

    mockFs.access.mockResolvedValue(undefined);
    mockFs.readdir
      .mockResolvedValueOnce([createMockDirent('org-orphan', true)] as never)
      .mockResolvedValueOnce([
        createMockDirent('untracked-logo.png', false),
      ] as never);

    mockFs.stat.mockResolvedValue(createMockStats(2048));
    mockFs.unlink.mockResolvedValue(undefined);

    const report = await service.reconcileUploads(false);

    expect(report.dryRun).toBe(false);
    expect(report.summary.orphanCount).toBe(1);
    expect(report.summary.reconciledOrphans).toBe(1);
    expect(report.orphans[0].reconciled).toBe(true);
    expect(mockFs.unlink).toHaveBeenCalledWith(
      resolve('/mock/uploads', 'organizations/org-orphan/untracked-logo.png'),
    );
  });

  it('identifies ghost DB records pointing to missing files and purges them when dryRun is false', async () => {
    prisma.organizationLogoAsset.findMany.mockResolvedValue([
      {
        organizationId: 'org-ghost',
        storageKey: 'organizations/org-ghost/deleted-file.png',
      },
    ]);

    // No files on disk
    mockFs.access.mockResolvedValue(undefined);
    mockFs.readdir.mockResolvedValue([] as never);

    prisma.organizationLogoAsset.delete.mockResolvedValue({
      organizationId: 'org-ghost',
      storageKey: 'organizations/org-ghost/deleted-file.png',
      mimeType: 'image/png',
      byteSize: 1000,
      width: 100,
      height: 100,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const report = await service.reconcileUploads(false);

    expect(report.summary.ghostCount).toBe(1);
    expect(report.summary.reconciledGhosts).toBe(1);
    expect(report.ghosts[0].organizationId).toBe('org-ghost');
    expect(report.ghosts[0].storageKey).toBe(
      'organizations/org-ghost/deleted-file.png',
    );
    expect(report.ghosts[0].reconciled).toBe(true);
    expect(prisma.organizationLogoAsset.delete).toHaveBeenCalledWith({
      where: { organizationId: 'org-ghost' },
    });
  });

  it('gracefully handles missing storage directory on disk', async () => {
    prisma.organizationLogoAsset.findMany.mockResolvedValue([]);
    mockFs.access.mockRejectedValue(
      new Error('ENOENT: no such file or directory'),
    );

    const report = await service.reconcileUploads(true);

    expect(report.summary.totalDiskFiles).toBe(0);
    expect(report.summary.orphanCount).toBe(0);
    expect(report.summary.ghostCount).toBe(0);
  });

  it('captures and reports errors during orphan file deletion', async () => {
    prisma.organizationLogoAsset.findMany.mockResolvedValue([]);

    mockFs.access.mockResolvedValue(undefined);
    mockFs.readdir
      .mockResolvedValueOnce([createMockDirent('org-1', true)] as never)
      .mockResolvedValueOnce([
        createMockDirent('locked-file.png', false),
      ] as never);

    mockFs.stat.mockResolvedValue(createMockStats(100));
    mockFs.unlink.mockRejectedValue(
      new Error('EPERM: operation not permitted'),
    );

    const report = await service.reconcileUploads(false);

    expect(report.summary.orphanCount).toBe(1);
    expect(report.summary.reconciledOrphans).toBe(0);
    expect(report.orphans[0].reconciled).toBe(false);
    expect(report.orphans[0].error).toContain('EPERM');
  });
});
