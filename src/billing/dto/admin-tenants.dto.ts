import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  OrganizationStatus,
  PlanTier,
  SubscriptionStatus,
} from '@prisma/client';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AdminTenantSubscriptionDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id: string;

  @ApiProperty({
    enum: SubscriptionStatus,
    example: SubscriptionStatus.ACTIVE,
  })
  status: SubscriptionStatus;

  @ApiProperty({ enum: PlanTier, example: PlanTier.PROFESSIONAL })
  planTier: PlanTier;

  @ApiProperty({ example: 'pro-monthly' })
  planCode: string;

  @ApiProperty({ example: 'Plan Profesional' })
  planName: string;

  @ApiPropertyOptional({ example: '2026-09-01T00:00:00.000Z' })
  trialEndsAt?: Date | null;

  @ApiPropertyOptional({ example: '2026-09-25T00:00:00.000Z' })
  currentPeriodEndsAt?: Date | null;

  @ApiProperty({ example: false })
  isExempt: boolean;

  @ApiPropertyOptional({ example: 'Convenio Asociación Civil Alianza Mental' })
  sponsorNotes?: string | null;

  @ApiPropertyOptional({ example: 10 })
  customTherapistsLimit?: number | null;

  @ApiPropertyOptional({ example: 250 })
  customPatientsLimit?: number | null;

  @ApiPropertyOptional({ example: 3 })
  customBranchesLimit?: number | null;
}

export class AdminTenantUsageDto {
  @ApiProperty({ example: 4 })
  therapistsCount: number;

  @ApiProperty({ example: 45 })
  patientsCount: number;

  @ApiProperty({ example: 1 })
  branchesCount: number;

  @ApiProperty({ example: 10, description: '-1 indicates unlimited' })
  therapistsLimit: number;

  @ApiProperty({ example: 250, description: '-1 indicates unlimited' })
  patientsLimit: number;

  @ApiProperty({ example: 3, description: '-1 indicates unlimited' })
  branchesLimit: number;
}

export class AdminTenantListItemDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id: string;

  @ApiProperty({ example: 'clinica-monte-sinai' })
  slug: string;

  @ApiProperty({ example: 'Clínica Monte Sinaí' })
  displayName: string;

  @ApiProperty({ example: 'Monte Sinaí Salud Mental S.C.' })
  legalName: string;

  @ApiProperty({
    enum: OrganizationStatus,
    example: OrganizationStatus.ACTIVE,
  })
  status: OrganizationStatus;

  @ApiProperty({ example: 'America/Hermosillo' })
  timezone: string;

  @ApiProperty({ example: '2026-01-15T12:00:00.000Z' })
  createdAt: Date;

  @ApiPropertyOptional({ type: AdminTenantSubscriptionDto })
  subscription?: AdminTenantSubscriptionDto | null;

  @ApiProperty({ type: AdminTenantUsageDto })
  usage: AdminTenantUsageDto;
}

export class ExtendTenantTrialDto {
  @ApiPropertyOptional({
    description: 'Number of trial days to add',
    example: 14,
    default: 14,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  daysToAdd?: number;
}

export class GrantLifetimeSponsorDto {
  @ApiPropertyOptional({
    description:
      'Convenio, alianza o notas descriptivas de la cortesía institucional',
    example: 'Convenio con Fundación Red Psicológica Sonora',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  sponsorNotes?: string;

  @ApiPropertyOptional({
    description:
      'Límite personalizado de terapeutas/miembros (-1 para ilimitado, null para heredar tier)',
    example: 50,
  })
  @IsOptional()
  @IsInt()
  customTherapistsLimit?: number;

  @ApiPropertyOptional({
    description:
      'Límite personalizado de pacientes (-1 para ilimitado, null para heredar tier)',
    example: 1000,
  })
  @IsOptional()
  @IsInt()
  customPatientsLimit?: number;

  @ApiPropertyOptional({
    description:
      'Límite personalizado de sucursales (-1 para ilimitado, null para heredar tier)',
    example: 5,
  })
  @IsOptional()
  @IsInt()
  customBranchesLimit?: number;
}

export class UpdateTenantQuotasDto {
  @ApiPropertyOptional({
    description:
      'Límite personalizado de terapeutas/miembros (-1 para ilimitado, null para restaurar default)',
    example: 20,
  })
  @IsOptional()
  @IsInt()
  customTherapistsLimit?: number | null;

  @ApiPropertyOptional({
    description:
      'Límite personalizado de pacientes (-1 para ilimitado, null para restaurar default)',
    example: 500,
  })
  @IsOptional()
  @IsInt()
  customPatientsLimit?: number | null;

  @ApiPropertyOptional({
    description:
      'Límite personalizado de sucursales (-1 para ilimitado, null para restaurar default)',
    example: 5,
  })
  @IsOptional()
  @IsInt()
  customBranchesLimit?: number | null;
}

export class FreezeTenantDto {
  @ApiProperty({
    description: 'True to freeze account, false to unfreeze',
    example: true,
  })
  @IsBoolean()
  freeze: boolean;

  @ApiPropertyOptional({
    description: 'Reason for freeze or unfreeze action',
    example: 'Incumplimiento de términos o solicitud legal preventiva',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class PlatformMetricsTenantsDto {
  @ApiProperty({ example: 12 })
  total: number;

  @ApiProperty({ example: 10 })
  active: number;

  @ApiProperty({ example: 2 })
  suspended: number;

  @ApiProperty({ example: 4 })
  trialing: number;

  @ApiProperty({ example: 3 })
  lifetime: number;

  @ApiProperty({ example: 3 })
  activeSubscriptions: number;
}

export class PlatformMetricsAggregatesDto {
  @ApiProperty({ example: 142 })
  totalPatients: number;

  @ApiProperty({ example: 520 })
  totalAppointments: number;

  @ApiProperty({ example: 28 })
  totalUsers: number;
}

export class PlatformMetricsMemoryDto {
  @ApiProperty({ example: 78 })
  heapUsedMB: number;

  @ApiProperty({ example: 120 })
  heapTotalMB: number;

  @ApiProperty({ example: 165 })
  rssMB: number;
}

export class PlatformMetricsResponseDto {
  @ApiProperty({ example: 'HEALTHY' })
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';

  @ApiProperty({ example: 3600 })
  uptimeSeconds: number;

  @ApiProperty({ example: '2026-08-26T05:00:00.000Z' })
  serverTimestamp: string;

  @ApiProperty({ example: 'production' })
  environment: string;

  @ApiProperty({ example: 'ONLINE' })
  databaseStatus: string;

  @ApiProperty({ type: PlatformMetricsTenantsDto })
  tenants: PlatformMetricsTenantsDto;

  @ApiProperty({ type: PlatformMetricsAggregatesDto })
  aggregates: PlatformMetricsAggregatesDto;

  @ApiProperty({ type: PlatformMetricsMemoryDto })
  memory: PlatformMetricsMemoryDto;
}

