import { access, readdir, stat, unlink } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import {
  GhostRecordAnomalyDto,
  OrphanFileAnomalyDto,
  ReconciliationReportDto,
} from './dto/reconciliation-report.dto';

export type DiskFileInfo = {
  storageKey: string;
  absolutePath: string;
  sizeBytes: number;
};

@Injectable()
export class OrphanReconciliationService {
  private readonly logger = new Logger(OrphanReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async reconcileUploads(dryRun = true): Promise<ReconciliationReportDto> {
    const scannedAt = new Date();
    const uploadsRoot = this.getUploadsRoot();
    const organizationsRoot = resolve(uploadsRoot, 'organizations');

    this.logger.log(
      JSON.stringify({
        event: 'reconciliation_scan_started',
        dryRun,
        uploadsRoot,
      }),
    );

    // 1. Retrieve all database asset records
    const dbRecords = await this.prisma.organizationLogoAsset.findMany({
      select: {
        organizationId: true,
        storageKey: true,
      },
    });

    const dbStorageKeyMap = new Map(
      dbRecords.map((record) => [record.storageKey, record.organizationId]),
    );

    // 2. Scan physical filesystem
    const diskFiles = await this.scanDiskFiles(organizationsRoot, uploadsRoot);
    const diskFilesMap = new Map(
      diskFiles.map((file) => [file.storageKey, file]),
    );

    // 3. Identify Orphans (files on disk with no DB record)
    const orphans: OrphanFileAnomalyDto[] = [];
    let reconciledOrphans = 0;

    for (const diskFile of diskFiles) {
      if (!dbStorageKeyMap.has(diskFile.storageKey)) {
        let reconciled = false;
        let error: string | undefined;

        if (!dryRun) {
          try {
            await unlink(diskFile.absolutePath);
            reconciled = true;
            reconciledOrphans += 1;
            this.logger.log(
              JSON.stringify({
                event: 'orphan_file_deleted',
                storageKey: diskFile.storageKey,
                path: diskFile.absolutePath,
              }),
            );
          } catch (err) {
            error = err instanceof Error ? err.message : String(err);
            this.logger.error(
              JSON.stringify({
                event: 'orphan_file_deletion_failed',
                storageKey: diskFile.storageKey,
                path: diskFile.absolutePath,
                error,
              }),
            );
          }
        }

        orphans.push({
          storageKey: diskFile.storageKey,
          absolutePath: diskFile.absolutePath,
          sizeBytes: diskFile.sizeBytes,
          reconciled,
          ...(error ? { error } : {}),
        });
      }
    }

    // 4. Identify Ghosts (DB records with missing files on disk)
    const ghosts: GhostRecordAnomalyDto[] = [];
    let reconciledGhosts = 0;

    for (const dbRecord of dbRecords) {
      if (!diskFilesMap.has(dbRecord.storageKey)) {
        const expectedPath = resolve(uploadsRoot, dbRecord.storageKey);
        let reconciled = false;
        let error: string | undefined;

        if (!dryRun) {
          try {
            await this.prisma.organizationLogoAsset.delete({
              where: { organizationId: dbRecord.organizationId },
            });
            reconciled = true;
            reconciledGhosts += 1;
            this.logger.log(
              JSON.stringify({
                event: 'ghost_record_purged',
                organizationId: dbRecord.organizationId,
                storageKey: dbRecord.storageKey,
              }),
            );
          } catch (err) {
            error = err instanceof Error ? err.message : String(err);
            this.logger.error(
              JSON.stringify({
                event: 'ghost_record_purge_failed',
                organizationId: dbRecord.organizationId,
                storageKey: dbRecord.storageKey,
                error,
              }),
            );
          }
        }

        ghosts.push({
          organizationId: dbRecord.organizationId,
          storageKey: dbRecord.storageKey,
          expectedPath,
          reconciled,
          ...(error ? { error } : {}),
        });
      }
    }

    const report: ReconciliationReportDto = {
      scannedAt,
      dryRun,
      summary: {
        totalDbRecords: dbRecords.length,
        totalDiskFiles: diskFiles.length,
        orphanCount: orphans.length,
        ghostCount: ghosts.length,
        reconciledOrphans,
        reconciledGhosts,
      },
      orphans,
      ghosts,
    };

    this.logger.log(
      JSON.stringify({
        event: 'reconciliation_scan_completed',
        dryRun,
        summary: report.summary,
      }),
    );

    return report;
  }

  private async scanDiskFiles(
    targetDir: string,
    uploadsRoot: string,
  ): Promise<DiskFileInfo[]> {
    const files: DiskFileInfo[] = [];

    try {
      await access(targetDir);
    } catch {
      // If the directory does not exist on disk, return empty list
      return files;
    }

    await this.collectFilesRecursively(targetDir, uploadsRoot, files);
    return files;
  }

  private async collectFilesRecursively(
    currentDir: string,
    uploadsRoot: string,
    accumulator: DiskFileInfo[],
  ): Promise<void> {
    try {
      const entries = await readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = resolve(currentDir, entry.name);

        if (entry.isDirectory()) {
          await this.collectFilesRecursively(
            fullPath,
            uploadsRoot,
            accumulator,
          );
        } else if (entry.isFile()) {
          const fileStat = await stat(fullPath);
          const relativePath = relative(uploadsRoot, fullPath);
          // Normalize to forward slashes for storageKey matching
          const storageKey = relativePath.split(sep).join('/');

          accumulator.push({
            storageKey,
            absolutePath: fullPath,
            sizeBytes: fileStat.size,
          });
        }
      }
    } catch (error) {
      this.logger.warn(
        JSON.stringify({
          event: 'directory_traversal_warning',
          currentDir,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private getUploadsRoot(): string {
    const uploadsRoot = this.config.uploadsPath;
    return isAbsolute(uploadsRoot)
      ? resolve(uploadsRoot)
      : resolve(process.cwd(), uploadsRoot);
  }
}
