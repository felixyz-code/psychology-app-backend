import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CurrentTenant } from '../tenant-context/decorators/current-tenant.decorator';
import { TenantRequired } from '../tenant-context/decorators/tenant-required.decorator';
import type { TenantContext } from '../tenant-context/tenant-context.types';
import { CreateScheduleBlockDto } from './dto/create-schedule-block.dto';
import { QueryScheduleBlocksDto } from './dto/query-schedule-blocks.dto';
import { ScheduleBlockResponseDto } from './dto/schedule-block-response.dto';
import { ScheduleBlocksService } from './schedule-blocks.service';

@ApiTags('schedule-blocks')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({
  description: 'Missing, invalid, or expired Bearer JWT',
})
@ApiForbiddenResponse({
  description: 'Authenticated user lacks a permitted role',
})
@TenantRequired()
@Controller('schedule-blocks')
@Roles(UserRole.ADMIN, UserRole.PSYCHOLOGIST)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
  }),
)
export class ScheduleBlocksController {
  constructor(private readonly scheduleBlocksService: ScheduleBlocksService) {}

  @Post()
  @AuditLog({
    action: 'CLINICAL_SCHEDULE_BLOCK_CREATED',
    resourceType: 'ScheduleBlock',
  })
  @ApiOperation({ summary: 'Create a schedule block for a therapist' })
  @ApiBody({ type: CreateScheduleBlockDto })
  @ApiCreatedResponse({
    description: 'Schedule block created successfully',
    type: ScheduleBlockResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid dates or overlap with appointment/block',
  })
  create(
    @Body() createDto: CreateScheduleBlockDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.scheduleBlocksService.create(
      createDto,
      this.createScope(tenant, user),
    );
  }

  @Get()
  @ApiOperation({ summary: 'Query schedule blocks for therapists' })
  @ApiOkResponse({
    description: 'List of schedule blocks',
    type: ScheduleBlockResponseDto,
    isArray: true,
  })
  findAll(
    @Query() query: QueryScheduleBlocksDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.scheduleBlocksService.findAll(
      query,
      this.createScope(tenant, user),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a schedule block by ID' })
  @ApiParam({
    name: 'id',
    description: 'Schedule block ID',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Schedule block details',
    type: ScheduleBlockResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Schedule block not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.scheduleBlocksService.findOne(
      id,
      this.createScope(tenant, user),
    );
  }

  @Delete(':id')
  @AuditLog({
    action: 'CLINICAL_SCHEDULE_BLOCK_DELETED',
    resourceType: 'ScheduleBlock',
  })
  @ApiOperation({ summary: 'Delete a schedule block' })
  @ApiParam({
    name: 'id',
    description: 'Schedule block ID',
    format: 'uuid',
  })
  @ApiOkResponse({
    description: 'Schedule block deleted successfully',
    type: ScheduleBlockResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Schedule block not found' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.scheduleBlocksService.remove(
      id,
      this.createScope(tenant, user),
    );
  }

  private createScope(tenant: TenantContext, user: AuthenticatedUser) {
    return {
      organizationId: tenant.organizationId,
      membershipId: tenant.membershipId,
      organizationRole: tenant.organizationRole,
      userId: user.id,
      legacyUserRole: tenant.legacyUserRole,
      resolutionMode: tenant.resolutionMode,
    };
  }
}
