import { extname } from 'node:path';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConsumes,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { DocumentsService } from './documents.service';

const allowedMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

const allowedExtensions = new Set(['.pdf', '.jpg', '.jpeg', '.png']);

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

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
      fileFilter: (_request, file, callback) => {
        const extension = extname(file.originalname).toLowerCase();
        const isAllowedType = allowedMimeTypes.has(file.mimetype);
        const isAllowedExtension = allowedExtensions.has(extension);

        if (!isAllowedType || !isAllowedExtension) {
          callback(
            new BadRequestException(
              'Only PDF, JPG, JPEG and PNG files are allowed',
            ),
            false,
          );
          return;
        }

        callback(null, true);
      },
    }),
  )
  @ApiOperation({ summary: 'Upload a document file and create metadata' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'caseFileId', 'uploadedById'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        caseFileId: {
          type: 'string',
          format: 'uuid',
          example: '550e8400-e29b-41d4-a716-446655440000',
        },
        uploadedById: {
          type: 'string',
          format: 'uuid',
          example: '550e8400-e29b-41d4-a716-446655440001',
        },
      },
    },
  })
  @ApiOkResponse({ description: 'Document uploaded successfully' })
  @ApiBadRequestResponse({
    description: 'Missing file, invalid payload, unsupported type, or file too large',
  })
  @ApiNotFoundResponse({ description: 'Case file or user not found' })
  upload(
    @Body() uploadDocumentDto: UploadDocumentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    return this.documentsService.upload(uploadDocumentDto, file);
  }

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
