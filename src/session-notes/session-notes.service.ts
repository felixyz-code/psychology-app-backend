import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSessionNoteDto } from './dto/create-session-note.dto';
import { UpdateSessionNoteDto } from './dto/update-session-note.dto';

@Injectable()
export class SessionNotesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createSessionNoteDto: CreateSessionNoteDto) {
    await this.ensureCaseFileExists(createSessionNoteDto.caseFileId);
    await this.ensureAuthorExists(createSessionNoteDto.authorId);

    return this.prisma.sessionNote.create({
      data: createSessionNoteDto,
    });
  }

  findAll() {
    return this.prisma.sessionNote.findMany({
      orderBy: {
        sessionDate: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const sessionNote = await this.prisma.sessionNote.findUnique({
      where: { id },
    });

    if (!sessionNote) {
      throw new NotFoundException(`Session note with id "${id}" not found`);
    }

    return sessionNote;
  }

  async findByCaseFileId(caseFileId: string) {
    await this.ensureCaseFileExists(caseFileId);

    return this.prisma.sessionNote.findMany({
      where: { caseFileId },
      orderBy: {
        sessionDate: 'desc',
      },
    });
  }

  async update(id: string, updateSessionNoteDto: UpdateSessionNoteDto) {
    await this.findOne(id);

    return this.prisma.sessionNote.update({
      where: { id },
      data: updateSessionNoteDto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.sessionNote.delete({
      where: { id },
    });
  }

  private async ensureCaseFileExists(caseFileId: string) {
    const caseFile = await this.prisma.caseFile.findUnique({
      where: { id: caseFileId },
    });

    if (!caseFile) {
      throw new NotFoundException(`Case file with id "${caseFileId}" not found`);
    }
  }

  private async ensureAuthorExists(authorId: string) {
    const author = await this.prisma.user.findUnique({
      where: { id: authorId },
      select: { id: true },
    });

    if (!author) {
      throw new NotFoundException(`User with id "${authorId}" not found`);
    }
  }
}
