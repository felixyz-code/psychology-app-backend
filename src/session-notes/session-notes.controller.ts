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
import { CreateSessionNoteDto } from './dto/create-session-note.dto';
import { UpdateSessionNoteDto } from './dto/update-session-note.dto';
import { SessionNotesService } from './session-notes.service';

@ApiTags('session-notes')
@ApiBearerAuth('bearer')
@Controller('session-notes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.PSYCHOLOGIST)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
  }),
)
export class SessionNotesController {
  constructor(private readonly sessionNotesService: SessionNotesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a session note' })
  @ApiBody({ type: CreateSessionNoteDto })
  @ApiOkResponse({ description: 'Session note created successfully' })
  @ApiBadRequestResponse({ description: 'Invalid session note payload' })
  @ApiNotFoundResponse({ description: 'Case file or author not found' })
  create(
    @Body() createSessionNoteDto: CreateSessionNoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sessionNotesService.create(createSessionNoteDto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List all session notes' })
  @ApiOkResponse({ description: 'Session notes retrieved successfully' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.sessionNotesService.findAll(user);
  }

  @Get('case-file/:caseFileId')
  @ApiOperation({ summary: 'List session notes by case file ID' })
  @ApiParam({
    name: 'caseFileId',
    description: 'Case file ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({ description: 'Session notes retrieved successfully' })
  @ApiBadRequestResponse({ description: 'Invalid case file ID' })
  @ApiNotFoundResponse({ description: 'Case file not found' })
  findByCaseFileId(
    @Param('caseFileId', ParseUUIDPipe) caseFileId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sessionNotesService.findByCaseFileId(caseFileId, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a session note by ID' })
  @ApiParam({
    name: 'id',
    description: 'Session note ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({ description: 'Session note retrieved successfully' })
  @ApiBadRequestResponse({ description: 'Invalid session note ID' })
  @ApiNotFoundResponse({ description: 'Session note not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sessionNotesService.findOne(id, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a session note' })
  @ApiParam({
    name: 'id',
    description: 'Session note ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({ type: UpdateSessionNoteDto })
  @ApiOkResponse({ description: 'Session note updated successfully' })
  @ApiBadRequestResponse({ description: 'Invalid session note payload or ID' })
  @ApiNotFoundResponse({ description: 'Session note not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateSessionNoteDto: UpdateSessionNoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sessionNotesService.update(id, updateSessionNoteDto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a session note' })
  @ApiParam({
    name: 'id',
    description: 'Session note ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({ description: 'Session note deleted successfully' })
  @ApiBadRequestResponse({ description: 'Invalid session note ID' })
  @ApiNotFoundResponse({ description: 'Session note not found' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sessionNotesService.remove(id, user);
  }
}

