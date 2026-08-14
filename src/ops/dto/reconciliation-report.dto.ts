import { ApiProperty } from '@nestjs/swagger';

export class ReconciliationSummaryDto {
  @ApiProperty({
    example: 10,
    description: 'Total organization logo records in database',
  })
  totalDbRecords!: number;

  @ApiProperty({
    example: 12,
    description: 'Total organization logo files found on filesystem',
  })
  totalDiskFiles!: number;

  @ApiProperty({ example: 2, description: 'Number of orphaned files on disk' })
  orphanCount!: number;

  @ApiProperty({
    example: 0,
    description: 'Number of ghost records in database',
  })
  ghostCount!: number;

  @ApiProperty({
    example: 0,
    description: 'Number of orphaned files removed from disk',
  })
  reconciledOrphans!: number;

  @ApiProperty({
    example: 0,
    description: 'Number of ghost records removed from database',
  })
  reconciledGhosts!: number;
}

export class OrphanFileAnomalyDto {
  @ApiProperty({
    example: 'organizations/org-uuid/file-uuid',
    description: 'Relative storage key',
  })
  storageKey!: string;

  @ApiProperty({
    example: '/app/uploads/organizations/org-uuid/file-uuid',
    description: 'Absolute file path on disk',
  })
  absolutePath!: string;

  @ApiProperty({ example: 45020, description: 'File size in bytes' })
  sizeBytes?: number;

  @ApiProperty({
    example: false,
    description: 'Whether the orphan was removed during reconciliation',
  })
  reconciled!: boolean;

  @ApiProperty({
    required: false,
    description: 'Error message if deletion failed',
  })
  error?: string;
}

export class GhostRecordAnomalyDto {
  @ApiProperty({
    example: 'org-uuid',
    description: 'Organization ID owning the ghost record',
  })
  organizationId!: string;

  @ApiProperty({
    example: 'organizations/org-uuid/missing-file-uuid',
    description: 'Expected storage key',
  })
  storageKey!: string;

  @ApiProperty({
    example: '/app/uploads/organizations/org-uuid/missing-file-uuid',
    description: 'Expected path that was not found on disk',
  })
  expectedPath!: string;

  @ApiProperty({
    example: false,
    description: 'Whether the ghost record was purged during reconciliation',
  })
  reconciled!: boolean;

  @ApiProperty({
    required: false,
    description: 'Error message if purge failed',
  })
  error?: string;
}

export class ReconciliationReportDto {
  @ApiProperty({
    example: '2026-08-14T05:00:00.000Z',
    description: 'Timestamp when scan occurred',
  })
  scannedAt!: Date;

  @ApiProperty({
    example: true,
    description: 'Whether scan was executed in dry-run mode',
  })
  dryRun!: boolean;

  @ApiProperty({ type: ReconciliationSummaryDto })
  summary!: ReconciliationSummaryDto;

  @ApiProperty({ type: [OrphanFileAnomalyDto] })
  orphans!: OrphanFileAnomalyDto[];

  @ApiProperty({ type: [GhostRecordAnomalyDto] })
  ghosts!: GhostRecordAnomalyDto[];
}
