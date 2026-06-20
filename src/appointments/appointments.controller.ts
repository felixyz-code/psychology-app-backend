import {
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
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

@ApiTags('appointments')
@Controller('appointments')
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
  create(@Body() createAppointmentDto: CreateAppointmentDto) {
    return this.appointmentsService.create(createAppointmentDto);
  }

  @Get()
  @ApiOperation({ summary: 'List all appointments' })
  @ApiOkResponse({ description: 'Appointments retrieved successfully' })
  findAll() {
    return this.appointmentsService.findAll();
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
  findByPatientId(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.appointmentsService.findByPatientId(patientId);
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
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.appointmentsService.findOne(id);
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
  ) {
    return this.appointmentsService.update(id, updateAppointmentDto);
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
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.appointmentsService.remove(id);
  }
}
