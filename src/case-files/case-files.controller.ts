import {
  ApiBearerAuth,
  ApiBadRequestResponse,
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
import {
  Body,
  Controller,
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
import { CaseFilesService } from './case-files.service';
import { CaseFileWorkspaceResponseDto } from './dto/case-file-workspace-response.dto';
import { CreateCaseFileDto } from './dto/create-case-file.dto';
import { UpdateCaseFileDto } from './dto/update-case-file.dto';
import { CaseFileResponseDto } from './dto/case-file-response.dto';

@ApiTags('case-files')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({
  description: 'Missing, invalid, or expired Bearer JWT',
})
@ApiForbiddenResponse({
  description: 'Authenticated user lacks a permitted role',
})
@Controller('case-files')
@Roles(UserRole.ADMIN, UserRole.PSYCHOLOGIST)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
  }),
)
export class CaseFilesController {
  constructor(private readonly caseFilesService: CaseFilesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a case file' })
  @ApiBody({ type: CreateCaseFileDto })
  @ApiCreatedResponse({
    description: 'Case file created successfully',
    type: CaseFileResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid case file payload' })
  @ApiConflictResponse({
    description: 'The patient already has an existing case file',
  })
  @ApiNotFoundResponse({ description: 'Patient not found' })
  create(
    @Body() createCaseFileDto: CreateCaseFileDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.caseFilesService.create(createCaseFileDto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List all case files' })
  @ApiOkResponse({
    description: 'Case files retrieved successfully',
    type: CaseFileResponseDto,
    isArray: true,
  })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.caseFilesService.findAll(user);
  }

  @Get('patient/:patientId')
  @ApiOperation({ summary: 'Get a case file by patient ID' })
  @ApiParam({
    name: 'patientId',
    description: 'Patient ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Case file retrieved successfully',
    type: CaseFileResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid patient ID' })
  @ApiNotFoundResponse({ description: 'Patient or case file not found' })
  findByPatientId(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.caseFilesService.findByPatientId(patientId, user);
  }

  @Get(':id/workspace')
  @ApiOperation({ summary: 'Get a clinical workspace by case file ID' })
  @ApiParam({
    name: 'id',
    description: 'Case file ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Clinical workspace retrieved successfully',
    type: CaseFileWorkspaceResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid case file ID' })
  @ApiNotFoundResponse({ description: 'Case file not found' })
  findWorkspace(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.caseFilesService.findWorkspace(id, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a case file by ID' })
  @ApiParam({
    name: 'id',
    description: 'Case file ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Case file retrieved successfully',
    type: CaseFileResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid case file ID' })
  @ApiNotFoundResponse({ description: 'Case file not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.caseFilesService.findOne(id, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a case file' })
  @ApiParam({
    name: 'id',
    description: 'Case file ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({ type: UpdateCaseFileDto })
  @ApiOkResponse({
    description: 'Case file updated successfully',
    type: CaseFileResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid case file payload or ID' })
  @ApiNotFoundResponse({ description: 'Case file not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateCaseFileDto: UpdateCaseFileDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.caseFilesService.update(id, updateCaseFileDto, user);
  }
}
