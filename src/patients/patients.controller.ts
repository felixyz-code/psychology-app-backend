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
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PatientResponseDto } from './dto/patient-response.dto';
import { PatientsService } from './patients.service';

@ApiTags('patients')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({
  description: 'Missing, invalid, or expired Bearer JWT',
})
@ApiForbiddenResponse({
  description: 'Authenticated user lacks a permitted role',
})
@Controller('patients')
@Roles(UserRole.ADMIN, UserRole.PSYCHOLOGIST)
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
  @ApiCreatedResponse({
    description: 'Patient created successfully',
    type: PatientResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid patient payload' })
  @ApiNotFoundResponse({
    description: 'Referenced psychologist is not available for this operation',
  })
  create(
    @Body() createPatientDto: CreatePatientDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.patientsService.create(createPatientDto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List all patients' })
  @ApiOkResponse({
    description: 'Patients retrieved successfully',
    type: PatientResponseDto,
    isArray: true,
  })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.patientsService.findAll(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a patient by ID' })
  @ApiParam({
    name: 'id',
    description: 'Patient ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Patient retrieved successfully',
    type: PatientResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid patient ID' })
  @ApiNotFoundResponse({ description: 'Patient not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.patientsService.findOne(id, user);
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
  @ApiOkResponse({
    description: 'Patient updated successfully',
    type: PatientResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid patient payload or ID' })
  @ApiNotFoundResponse({ description: 'Patient not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updatePatientDto: UpdatePatientDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.patientsService.update(id, updatePatientDto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a patient' })
  @ApiParam({
    name: 'id',
    description: 'Patient ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Patient deleted successfully',
    type: PatientResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid patient ID' })
  @ApiNotFoundResponse({ description: 'Patient not found' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.patientsService.remove(id, user);
  }
}
