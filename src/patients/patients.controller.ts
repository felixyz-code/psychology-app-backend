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
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PatientsService } from './patients.service';

@ApiTags('patients')
@Controller('patients')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
  }),
)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a patient' })
  @ApiBody({ type: CreatePatientDto })
  @ApiOkResponse({ description: 'Patient created successfully' })
  @ApiBadRequestResponse({ description: 'Invalid patient payload' })
  create(@Body() createPatientDto: CreatePatientDto) {
    return this.patientsService.create(createPatientDto);
  }

  @Get()
  @ApiOperation({ summary: 'List all patients' })
  @ApiOkResponse({ description: 'Patients retrieved successfully' })
  findAll() {
    return this.patientsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a patient by ID' })
  @ApiParam({
    name: 'id',
    description: 'Patient ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({ description: 'Patient retrieved successfully' })
  @ApiBadRequestResponse({ description: 'Invalid patient ID' })
  @ApiNotFoundResponse({ description: 'Patient not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.patientsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a patient' })
  @ApiParam({
    name: 'id',
    description: 'Patient ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({ type: UpdatePatientDto })
  @ApiOkResponse({ description: 'Patient updated successfully' })
  @ApiBadRequestResponse({ description: 'Invalid patient payload or ID' })
  @ApiNotFoundResponse({ description: 'Patient not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updatePatientDto: UpdatePatientDto,
  ) {
    return this.patientsService.update(id, updatePatientDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a patient' })
  @ApiParam({
    name: 'id',
    description: 'Patient ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({ description: 'Patient deleted successfully' })
  @ApiBadRequestResponse({ description: 'Invalid patient ID' })
  @ApiNotFoundResponse({ description: 'Patient not found' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.patientsService.remove(id);
  }
}
