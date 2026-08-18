import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
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
      'List forensic audit log entries for organization (OWNER / AUDITOR only)',
  })
  @ApiOkResponse({
    description: 'Paginated audit log entries retrieved successfully',
    type: AuditLogsPaginatedResponseDto,
  })
  async findAll(
    @CurrentTenant(true) tenant: TenantContext,
    @Query() query: AuditLogsQueryDto,
  ) {
    const fromDate = query.from ? new Date(query.from) : undefined;
    const toDate = query.to ? new Date(query.to) : undefined;

    return this.auditLogService.findAll({
      organizationId: tenant.organizationId,
      branchId: query.branchId,
      userId: query.userId,
      resourceType: query.resourceType,
      resourceId: query.resourceId,
      action: query.action,
      search: query.search,
      from: fromDate,
      to: toDate,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    });
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
