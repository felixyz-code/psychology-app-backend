import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

@ApiTags('appointments')
@ApiBearerAuth('bearer')
@Controller('appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
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
  @ApiOperation({ summary: 'Create an appointment' })
  @ApiBody({ type: CreateAppointmentDto })
  @ApiOkResponse({ description: 'Appointment created successfully' })
  @ApiBadRequestResponse({ description: 'Invalid appointment payload' })
  @ApiNotFoundResponse({ description: 'Patient or psychologist not found' })
  create(
    @Body() createAppointmentDto: CreateAppointmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.appointmentsService.create(createAppointmentDto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List all appointments' })
  @ApiOkResponse({ description: 'Appointments retrieved successfully' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.appointmentsService.findAll(user);
  }

  @Get('patient/:patientId')
  @ApiOperation({ summary: 'List appointments by patient ID' })
  @ApiParam({
    name: 'patientId',
    description: 'Patient ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({ description: 'Appointments retrieved successfully' })
  @ApiBadRequestResponse({ description: 'Invalid patient ID' })
  @ApiNotFoundResponse({ description: 'Patient not found' })
  findByPatientId(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.appointmentsService.findByPatientId(patientId, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an appointment by ID' })
  @ApiParam({
    name: 'id',
    description: 'Appointment ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({ description: 'Appointment retrieved successfully' })
  @ApiBadRequestResponse({ description: 'Invalid appointment ID' })
  @ApiNotFoundResponse({ description: 'Appointment not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.appointmentsService.findOne(id, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an appointment' })
  @ApiParam({
    name: 'id',
    description: 'Appointment ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({ type: UpdateAppointmentDto })
  @ApiOkResponse({ description: 'Appointment updated successfully' })
  @ApiBadRequestResponse({ description: 'Invalid appointment payload or ID' })
  @ApiNotFoundResponse({
    description: 'Appointment, patient, or psychologist not found',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateAppointmentDto: UpdateAppointmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.appointmentsService.update(id, updateAppointmentDto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an appointment' })
  @ApiParam({
    name: 'id',
    description: 'Appointment ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({ description: 'Appointment deleted successfully' })
  @ApiBadRequestResponse({ description: 'Invalid appointment ID' })
  @ApiNotFoundResponse({ description: 'Appointment not found' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.appointmentsService.remove(id, user);
  }
}

