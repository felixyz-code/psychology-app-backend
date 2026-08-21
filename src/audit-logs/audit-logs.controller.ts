import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { RequireCapabilities } from '../tenant-context/authorization/require-capabilities.decorator';
import { CapabilitiesGuard } from '../tenant-context/authorization/capabilities.guard';
import { OrganizationCapability } from '../tenant-context/authorization/organization-capability';
import { CurrentTenant } from '../tenant-context/decorators/current-tenant.decorator';
import { TenantRequired } from '../tenant-context/decorators/tenant-required.decorator';
import type { TenantContext } from '../tenant-context/tenant-context.types';
import { AuditLogService } from './audit-logs.service';
import { AuditLogsQueryDto } from './dto/audit-logs-query.dto';
import {
  AuditLogEntryDto,
  AuditLogsPaginatedResponseDto,
} from './dto/audit-logs-response.dto';

@ApiTags('audit-logs')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({
  description: 'Missing, invalid, or expired Bearer JWT',
})
@ApiForbiddenResponse({
  description: 'Authenticated user lacks required audit.read capability',
})
@ApiHeader({
  name: 'X-Organization-Id',
  required: false,
  description:
    'Optional UUID selection hint. A tenant-required route resolves the only eligible membership when it is omitted.',
})
@TenantRequired()
@UseGuards(CapabilitiesGuard)
@RequireCapabilities(OrganizationCapability.AUDIT_READ)
@Controller('audit-logs')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
  }),
)
export class AuditLogsController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @ApiOperation({
    summary:
      'List forensic audit log entries for organization (OWNER / ADMIN / AUDITOR)',
  })
  @ApiOkResponse({
    description: 'Paginated audit log entries retrieved successfully',
    type: AuditLogsPaginatedResponseDto,
  })
  async findAll(
    @CurrentTenant(true) tenant: TenantContext,
    @Query() query: AuditLogsQueryDto,
  ) {
    const fromDate =
      query.from || query.startDate
        ? new Date(query.from || query.startDate!)
        : undefined;
    const toDate =
      query.to || query.endDate
        ? new Date(query.to || query.endDate!)
        : undefined;

    return this.auditLogService.findAll({
      organizationId: query.tenantId ?? tenant.organizationId,
      branchId: query.branchId,
      userId: query.userId,
      resource: query.resource,
      resourceType: query.resourceType,
      resourceId: query.resourceId,
      action: query.action,
      severity: query.severity,
      search: query.search,
      from: fromDate,
      to: toDate,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    });
  }

  @Get('export')
  @ApiOperation({
    summary:
      'Export forensic audit log entries for organization as CSV or JSON file',
  })
  @ApiOkResponse({
    description: 'Audit logs exported successfully as downloadable file',
  })
  async export(
    @CurrentTenant(true) tenant: TenantContext,
    @Query() query: AuditLogsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const fromDate =
      query.from || query.startDate
        ? new Date(query.from || query.startDate!)
        : undefined;
    const toDate =
      query.to || query.endDate
        ? new Date(query.to || query.endDate!)
        : undefined;
    const format = query.format === 'json' ? 'json' : 'csv';

    const result = await this.auditLogService.exportLogs(
      {
        organizationId: query.tenantId ?? tenant.organizationId,
        branchId: query.branchId,
        userId: query.userId,
        resource: query.resource,
        resourceType: query.resourceType,
        resourceId: query.resourceId,
        action: query.action,
        severity: query.severity,
        search: query.search,
        from: fromDate,
        to: toDate,
        limit: query.limit,
        offset: query.offset,
      },
      format,
    );

    res.setHeader('Content-Type', result.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );

    return result.data;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single audit log entry by ID' })
  @ApiParam({
    name: 'id',
    description: 'Audit Log UUID',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Audit log entry retrieved successfully',
    type: AuditLogEntryDto,
  })
  @ApiNotFoundResponse({ description: 'Audit log entry not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    const entry = await this.auditLogService.findById(
      id,
      tenant.organizationId,
    );
    if (!entry) {
      throw new NotFoundException(`Audit log entry ${id} not found`);
    }
    return entry;
  }
}
