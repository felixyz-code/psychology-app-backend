import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  Body,
  Controller,
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
import { CaseFilesService } from './case-files.service';
import { CreateCaseFileDto } from './dto/create-case-file.dto';
import { UpdateCaseFileDto } from './dto/update-case-file.dto';

@ApiTags('case-files')
@ApiBearerAuth('bearer')
@Controller('case-files')
@UseGuards(JwtAuthGuard, RolesGuard)
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
  @ApiOkResponse({ description: 'Case file created successfully' })
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
  @ApiOkResponse({ description: 'Case files retrieved successfully' })
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
  @ApiOkResponse({ description: 'Case file retrieved successfully' })
  @ApiBadRequestResponse({ description: 'Invalid patient ID' })
  @ApiNotFoundResponse({ description: 'Patient or case file not found' })
  findByPatientId(
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.caseFilesService.findByPatientId(patientId, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a case file by ID' })
  @ApiParam({
    name: 'id',
    description: 'Case file ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({ description: 'Case file retrieved successfully' })
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
  @ApiOkResponse({ description: 'Case file updated successfully' })
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
