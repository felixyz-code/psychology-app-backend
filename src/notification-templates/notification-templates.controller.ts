import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuditLog } from '../audit-logs/decorators/audit-log.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentTenant } from '../tenant-context/decorators/current-tenant.decorator';
import { TenantRequired } from '../tenant-context/decorators/tenant-required.decorator';
import type { TenantContext } from '../tenant-context/tenant-context.types';
import { CreateNotificationTemplateDto } from './dto/create-notification-template.dto';
import {
  NotificationTemplateResponseDto,
  RenderPreviewResponseDto,
  TemplateVariableMetadataDto,
} from './dto/notification-template-response.dto';
import { QueryNotificationTemplatesDto } from './dto/query-notification-templates.dto';
import { RenderTemplatePreviewDto } from './dto/render-template-preview.dto';
import { UpdateNotificationTemplateDto } from './dto/update-notification-template.dto';
import { NotificationTemplatesService } from './notification-templates.service';

@ApiTags('notification-templates')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({
  description: 'Missing, invalid, or expired Bearer JWT',
})
@ApiForbiddenResponse({
  description: 'Authenticated user lacks permitted role',
})
@TenantRequired()
@Controller('notification-templates')
@Roles(UserRole.ADMIN, UserRole.PSYCHOLOGIST)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
  }),
)
export class NotificationTemplatesController {
  constructor(
    private readonly notificationTemplatesService: NotificationTemplatesService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List all notification templates for the active organization',
  })
  @ApiOkResponse({
    description: 'List of notification templates',
    type: NotificationTemplateResponseDto,
    isArray: true,
  })
  findAll(
    @Query() query: QueryNotificationTemplatesDto,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.notificationTemplatesService.findAll(
      query,
      tenant.organizationId,
    );
  }

  @Get('variables')
  @ApiOperation({
    summary: 'Get metadata catalogue of all dynamic placeholders available for templates',
  })
  @ApiOkResponse({
    description: 'List of variable definitions and sample values',
    type: TemplateVariableMetadataDto,
    isArray: true,
  })
  getVariables() {
    return this.notificationTemplatesService.getVariablesMetadata();
  }

  @Post('seed-defaults')
  @AuditLog({
    action: 'NOTIFICATION_TEMPLATE_DEFAULTS_SEEDED',
    resourceType: 'NotificationTemplate',
  })
  @ApiOperation({
    summary: 'Seed default stock templates for the organization',
  })
  @ApiOkResponse({
    description: 'Default templates initialized or preserved',
  })
  seedDefaults(@CurrentTenant(true) tenant: TenantContext) {
    return this.notificationTemplatesService.seedDefaultsForOrganization(
      tenant.organizationId,
    );
  }

  @Post('render-preview')
  @AuditLog({
    action: 'NOTIFICATION_TEMPLATE_PREVIEW_RENDERED',
    resourceType: 'NotificationTemplate',
  })
  @ApiOperation({
    summary: 'Render live preview of a template with sample context data',
  })
  @ApiBody({ type: RenderTemplatePreviewDto })
  @ApiOkResponse({
    description: 'Rendered subject and body with placeholders replaced',
    type: RenderPreviewResponseDto,
  })
  renderPreview(
    @Body() dto: RenderTemplatePreviewDto,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.notificationTemplatesService.renderPreview(
      dto,
      tenant.organizationId,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a notification template by ID' })
  @ApiParam({
    name: 'id',
    description: 'Notification template ID',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Notification template details',
    type: NotificationTemplateResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Notification template not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.notificationTemplatesService.findOne(id, tenant.organizationId);
  }

  @Post()
  @AuditLog({
    action: 'NOTIFICATION_TEMPLATE_CREATED',
    resourceType: 'NotificationTemplate',
  })
  @ApiOperation({
    summary: 'Create a new custom notification template',
  })
  @ApiBody({ type: CreateNotificationTemplateDto })
  @ApiCreatedResponse({
    description: 'Notification template created successfully',
    type: NotificationTemplateResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiConflictResponse({
    description: 'Template already exists for this channel and event type',
  })
  create(
    @Body() dto: CreateNotificationTemplateDto,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.notificationTemplatesService.create(dto, tenant.organizationId);
  }

  @Patch(':id')
  @AuditLog({
    action: 'NOTIFICATION_TEMPLATE_UPDATED',
    resourceType: 'NotificationTemplate',
  })
  @ApiOperation({ summary: 'Update an existing notification template' })
  @ApiParam({
    name: 'id',
    description: 'Notification template ID',
    format: 'uuid',
  })
  @ApiBody({ type: UpdateNotificationTemplateDto })
  @ApiOkResponse({
    description: 'Notification template updated successfully',
    type: NotificationTemplateResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Notification template not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNotificationTemplateDto,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.notificationTemplatesService.update(
      id,
      dto,
      tenant.organizationId,
    );
  }

  @Delete(':id')
  @AuditLog({
    action: 'NOTIFICATION_TEMPLATE_DELETED',
    resourceType: 'NotificationTemplate',
  })
  @ApiOperation({ summary: 'Delete a notification template' })
  @ApiParam({
    name: 'id',
    description: 'Notification template ID',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Notification template deleted successfully',
  })
  @ApiNotFoundResponse({ description: 'Notification template not found' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.notificationTemplatesService.remove(id, tenant.organizationId);
  }
}
