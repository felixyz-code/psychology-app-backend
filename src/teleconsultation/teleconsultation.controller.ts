import {
  ApiBearerAuth,
  ApiBadRequestResponse,
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
import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuditLog } from '../audit-logs/decorators/audit-log.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CurrentTenant } from '../tenant-context/decorators/current-tenant.decorator';
import { TenantRequired } from '../tenant-context/decorators/tenant-required.decorator';
import type { TenantContext } from '../tenant-context/tenant-context.types';
import { TeleconsultationService } from './teleconsultation.service';
import { TeleconsultationRoomResponseDto } from './dto/teleconsultation-room-response.dto';

const APPOINTMENT_ID_PARAM = {
  name: 'appointmentId',
  description: 'Appointment UUID',
  format: 'uuid',
  example: '550e8400-e29b-41d4-a716-446655440000',
};

@ApiTags('teleconsultation')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({
  description: 'Missing, invalid, or expired Bearer JWT',
})
@ApiForbiddenResponse({
  description: 'Authenticated user lacks a permitted role',
})
@TenantRequired()
@Controller('appointments/:appointmentId/teleconsultation-room')
@Roles(UserRole.ADMIN, UserRole.PSYCHOLOGIST)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class TeleconsultationController {
  constructor(
    private readonly teleconsultationService: TeleconsultationService,
  ) {}

  @Post()
  @AuditLog({
    action: 'TELECONSULTATION_ROOM_CREATED',
    resourceType: 'TeleconsultationRoom',
  })
  @ApiOperation({
    summary: 'Create a secure teleconsultation room for an appointment',
  })
  @ApiParam(APPOINTMENT_ID_PARAM)
  @ApiCreatedResponse({
    description: 'Teleconsultation room created',
    type: TeleconsultationRoomResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid appointment ID' })
  @ApiConflictResponse({
    description: 'An active room already exists for this appointment',
  })
  @ApiNotFoundResponse({ description: 'Appointment not found in this tenant' })
  createRoom(
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.teleconsultationService.createRoom(
      appointmentId,
      this.buildScope(tenant, user),
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get the teleconsultation room for an appointment' })
  @ApiParam(APPOINTMENT_ID_PARAM)
  @ApiOkResponse({
    description: 'Teleconsultation room retrieved',
    type: TeleconsultationRoomResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid appointment ID' })
  @ApiNotFoundResponse({ description: 'Room or appointment not found' })
  getRoom(
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.teleconsultationService.getRoom(
      appointmentId,
      this.buildScope(tenant, user),
    );
  }

  @Post('activate')
  @AuditLog({
    action: 'TELECONSULTATION_ROOM_ACTIVATED',
    resourceType: 'TeleconsultationRoom',
  })
  @ApiOperation({ summary: 'Activate a PENDING teleconsultation room' })
  @ApiParam(APPOINTMENT_ID_PARAM)
  @ApiOkResponse({
    description: 'Room activated',
    type: TeleconsultationRoomResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Room already active, expired, or terminated',
  })
  @ApiNotFoundResponse({ description: 'Room or appointment not found' })
  activateRoom(
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.teleconsultationService.activateRoom(
      appointmentId,
      this.buildScope(tenant, user),
    );
  }

  @Delete()
  @AuditLog({
    action: 'TELECONSULTATION_ROOM_TERMINATED',
    resourceType: 'TeleconsultationRoom',
  })
  @ApiOperation({ summary: 'Terminate a teleconsultation room' })
  @ApiParam(APPOINTMENT_ID_PARAM)
  @ApiOkResponse({
    description: 'Room terminated',
    type: TeleconsultationRoomResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Room is already terminated' })
  @ApiForbiddenResponse({
    description: 'Only the assigned therapist or admin can terminate',
  })
  @ApiNotFoundResponse({ description: 'Room or appointment not found' })
  terminateRoom(
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.teleconsultationService.terminateRoom(
      appointmentId,
      this.buildScope(tenant, user),
    );
  }

  private buildScope(tenant: TenantContext, user: AuthenticatedUser) {
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
