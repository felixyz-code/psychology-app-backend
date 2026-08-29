import {
  ApiBearerAuth,
  ApiBadRequestResponse,
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
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { AppointmentResponseDto } from './dto/appointment-response.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { AvailabilityResponseDto } from './dto/availability-response.dto';

@ApiTags('appointments')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({
  description: 'Missing, invalid, or expired Bearer JWT',
})
@ApiForbiddenResponse({
  description: 'Authenticated user lacks a permitted role',
})
@TenantRequired()
@Controller('appointments')
@Roles(UserRole.ADMIN, UserRole.PSYCHOLOGIST)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
  }),
)
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post()
  @AuditLog({
    action: 'CLINICAL_APPOINTMENT_MUTATION',
    resourceType: 'Appointment',
  })
  @ApiOperation({ summary: 'Create an appointment' })
  @ApiBody({ type: CreateAppointmentDto })
  @ApiCreatedResponse({
    description: 'Appointment created successfully',
    type: AppointmentResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid appointment payload' })
  @ApiNotFoundResponse({ description: 'Patient or psychologist not found' })
  create(
    @Body() createAppointmentDto: CreateAppointmentDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.appointmentsService.create(
      createAppointmentDto,
      this.createScope(tenant, user),
    );
  }

  @Get()
  @ApiOperation({ summary: 'List all appointments' })
  @ApiOkResponse({
    description: 'Appointments retrieved successfully',
    type: AppointmentResponseDto,
    isArray: true,
  })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
    @Headers('x-branch-id') branchId?: string,
  ) {
    return this.appointmentsService.findAll(
      this.createScope(tenant, user, branchId),
    );
  }

  @Get('availability')
  @ApiOperation({
    summary: 'Calculate available appointment slots for a therapist',
  })
  @ApiOkResponse({
    description: 'Calculated availability slots',
    type: AvailabilityResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid date or parameters' })
  getAvailability(
    @Query() query: AvailabilityQueryDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
    @Headers('x-branch-id') branchId?: string,
  ) {
    return this.appointmentsService.getAvailability(
      query,
      this.createScope(tenant, user, branchId),
    );
  }

  @Get('patient/:patientId')
  @ApiOperation({ summary: 'List appointments by patient ID' })
  @ApiParam({
    name: 'patientId',
    description: 'Patient ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Appointments retrieved successfully',
    type: AppointmentResponseDto,
    isArray: true,
  })
  @ApiBadRequestResponse({ description: 'Invalid patient ID' })
  @ApiNotFoundResponse({ description: 'Patient not found' })
  findByPatientId(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.appointmentsService.findByPatientId(
      patientId,
      this.createScope(tenant, user),
    );
  }

  @Post(':id/reschedule')
  @AuditLog({
    action: 'CLINICAL_APPOINTMENT_RESCHEDULED',
    resourceType: 'Appointment',
  })
  @ApiOperation({
    summary: 'Reschedule an appointment with overlap validation',
  })
  @ApiParam({
    name: 'id',
    description: 'Appointment ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({ type: RescheduleAppointmentDto })
  @ApiOkResponse({
    description: 'Appointment rescheduled successfully',
    type: AppointmentResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Time conflict or invalid payload' })
  @ApiNotFoundResponse({ description: 'Appointment not found' })
  reschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() rescheduleDto: RescheduleAppointmentDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.appointmentsService.reschedule(
      id,
      rescheduleDto,
      this.createScope(tenant, user),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an appointment by ID' })
  @ApiParam({
    name: 'id',
    description: 'Appointment ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Appointment retrieved successfully',
    type: AppointmentResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid appointment ID' })
  @ApiNotFoundResponse({ description: 'Appointment not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.appointmentsService.findOne(id, this.createScope(tenant, user));
  }

  @Patch(':id')
  @AuditLog({
    action: 'CLINICAL_APPOINTMENT_MUTATION',
    resourceType: 'Appointment',
  })
  @ApiOperation({ summary: 'Update an appointment' })
  @ApiParam({
    name: 'id',
    description: 'Appointment ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({ type: UpdateAppointmentDto })
  @ApiOkResponse({
    description: 'Appointment updated successfully',
    type: AppointmentResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid appointment payload or ID' })
  @ApiNotFoundResponse({
    description: 'Appointment, patient, or psychologist not found',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateAppointmentDto: UpdateAppointmentDto,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.appointmentsService.update(
      id,
      updateAppointmentDto,
      this.createScope(tenant, user),
    );
  }

  @Delete(':id')
  @AuditLog({
    action: 'CLINICAL_APPOINTMENT_MUTATION',
    resourceType: 'Appointment',
  })
  @ApiOperation({ summary: 'Delete an appointment' })
  @ApiParam({
    name: 'id',
    description: 'Appointment ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Appointment deleted successfully',
    type: AppointmentResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid appointment ID' })
  @ApiNotFoundResponse({ description: 'Appointment not found' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.appointmentsService.remove(id, this.createScope(tenant, user));
  }

  private createScope(
    tenant: TenantContext,
    user: AuthenticatedUser,
    branchId?: string,
  ) {
    return {
      organizationId: tenant.organizationId,
      membershipId: tenant.membershipId,
      organizationRole: tenant.organizationRole,
      userId: user.id,
      legacyUserRole: tenant.legacyUserRole,
      resolutionMode: tenant.resolutionMode,
      branchId:
        branchId && branchId !== 'ALL' && branchId.trim() !== ''
          ? branchId.trim()
          : undefined,
    };
  }
}
