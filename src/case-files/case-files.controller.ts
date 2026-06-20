import {
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
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CaseFilesService } from './case-files.service';
import { CreateCaseFileDto } from './dto/create-case-file.dto';
import { UpdateCaseFileDto } from './dto/update-case-file.dto';

@ApiTags('case-files')
@Controller('case-files')
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
  create(@Body() createCaseFileDto: CreateCaseFileDto) {
    return this.caseFilesService.create(createCaseFileDto);
  }

  @Get()
  @ApiOperation({ summary: 'List all case files' })
  @ApiOkResponse({ description: 'Case files retrieved successfully' })
  findAll() {
    return this.caseFilesService.findAll();
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
  findByPatientId(@Param('patientId', ParseUUIDPipe) patientId: string) {
    return this.caseFilesService.findByPatientId(patientId);
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
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.caseFilesService.findOne(id);
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
  ) {
    return this.caseFilesService.update(id, updateCaseFileDto);
  }
}
