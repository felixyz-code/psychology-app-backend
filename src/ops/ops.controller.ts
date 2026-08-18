import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SkipTenantContext } from '../tenant-context/decorators/skip-tenant-context.decorator';
import { AuditLog } from '../audit-logs/decorators/audit-log.decorator';
import { ReconcileUploadsDto } from './dto/reconcile-uploads.dto';
import { ReconciliationReportDto } from './dto/reconciliation-report.dto';
import { OrphanReconciliationService } from './orphan-reconciliation.service';

@ApiTags('ops')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Authentication is required' })
@ApiForbiddenResponse({ description: 'ADMIN role is required' })
@SkipTenantContext()
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@Controller('ops')
export class OpsController {
  constructor(
    private readonly reconciliationService: OrphanReconciliationService,
  ) {}

  @Post('reconcile/uploads')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @AuditLog({
    action: 'OPS_UPLOADS_RECONCILIATION',
    resourceType: 'StorageVolume',
  })
  @ApiOperation({
    summary:
      'Scan and reconcile filesystem-database discrepancies for uploaded assets',
    description:
      'Strictly requires application-level ADMIN role. Bypasses tenant context. By default runs in dryRun mode unless explicitly set to false.',
  })
  @ApiOkResponse({
    type: ReconciliationReportDto,
    description:
      'Detailed reconciliation report containing orphan files and ghost database records',
  })
  reconcileUploads(
    @Body() dto: ReconcileUploadsDto,
  ): Promise<ReconciliationReportDto> {
    const dryRun = dto?.dryRun !== false;
    return this.reconciliationService.reconcileUploads(dryRun);
  }
}
