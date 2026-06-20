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
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { DocumentsService } from './documents.service';

@ApiTags('documents')
@Controller('documents')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
  }),
)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @ApiOperation({ summary: 'Create document metadata' })
  @ApiBody({ type: CreateDocumentDto })
  @ApiOkResponse({ description: 'Document metadata created successfully' })
  @ApiBadRequestResponse({ description: 'Invalid document payload' })
  @ApiNotFoundResponse({ description: 'Case file or user not found' })
  create(@Body() createDocumentDto: CreateDocumentDto) {
    return this.documentsService.create(createDocumentDto);
  }

  @Get()
  @ApiOperation({ summary: 'List all documents metadata' })
  @ApiOkResponse({ description: 'Documents retrieved successfully' })
  findAll() {
    return this.documentsService.findAll();
  }

  @Get('case-file/:caseFileId')
  @ApiOperation({ summary: 'List documents by case file ID' })
  @ApiParam({
    name: 'caseFileId',
    description: 'Case file ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({ description: 'Documents retrieved successfully' })
  @ApiBadRequestResponse({ description: 'Invalid case file ID' })
  @ApiNotFoundResponse({ description: 'Case file not found' })
  findByCaseFileId(@Param('caseFileId', ParseUUIDPipe) caseFileId: string) {
    return this.documentsService.findByCaseFileId(caseFileId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get document metadata by ID' })
  @ApiParam({
    name: 'id',
    description: 'Document ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({ description: 'Document retrieved successfully' })
  @ApiBadRequestResponse({ description: 'Invalid document ID' })
  @ApiNotFoundResponse({ description: 'Document not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update document metadata' })
  @ApiParam({
    name: 'id',
    description: 'Document ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({ type: UpdateDocumentDto })
  @ApiOkResponse({ description: 'Document updated successfully' })
  @ApiBadRequestResponse({ description: 'Invalid document payload or ID' })
  @ApiNotFoundResponse({ description: 'Document not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDocumentDto: UpdateDocumentDto,
  ) {
    return this.documentsService.update(id, updateDocumentDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete document metadata' })
  @ApiParam({
    name: 'id',
    description: 'Document ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({ description: 'Document deleted successfully' })
  @ApiBadRequestResponse({ description: 'Invalid document ID' })
  @ApiNotFoundResponse({ description: 'Document not found' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentsService.remove(id);
  }
}
