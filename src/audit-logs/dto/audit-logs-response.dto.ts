import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuditLogUserDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  email: string;
}

export class AuditLogBranchDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  code: string;
}

export class AuditLogEntryDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: '2026-08-17T12:00:00.000Z' })
  timestamp: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  organizationId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  branchId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  userId?: string | null;

  @ApiProperty({ example: 'CLINICAL_PATIENT_READ' })
  action: string;

  @ApiProperty({ example: 'Patient' })
  resourceType: string;

  @ApiPropertyOptional({
    nullable: true,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  resourceId?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '192.168.1.1' })
  ipAddress?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Mozilla/5.0...' })
  userAgent?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 200 })
  statusCode?: number | null;

  @ApiPropertyOptional({ nullable: true, example: 12 })
  executionTimeMs?: number | null;

  @ApiPropertyOptional({ nullable: true, example: 'OWNER' })
  actorRole?: string | null;

  @ApiPropertyOptional({ nullable: true })
  details?: Record<string, any> | null;

  @ApiPropertyOptional({ type: () => AuditLogUserDto, nullable: true })
  user?: AuditLogUserDto | null;

  @ApiPropertyOptional({ type: () => AuditLogBranchDto, nullable: true })
  branch?: AuditLogBranchDto | null;
}

export class AuditLogsPaginatedResponseDto {
  @ApiProperty({ type: [AuditLogEntryDto] })
  items: AuditLogEntryDto[];

  @ApiProperty({ example: 150 })
  total: number;

  @ApiProperty({ example: 50 })
  limit: number;

  @ApiProperty({ example: 0 })
  offset: number;
}
