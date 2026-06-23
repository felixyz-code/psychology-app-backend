import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSessionNoteDto } from './dto/create-session-note.dto';
import { UpdateSessionNoteDto } from './dto/update-session-note.dto';

@Injectable()
export class SessionNotesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    createSessionNoteDto: CreateSessionNoteDto,
    user: AuthenticatedUser,
  ) {
    await this.getAccessibleCaseFileOrThrow(createSessionNoteDto.caseFileId, user);

    const authorId = this.isAdmin(user) ? createSessionNoteDto.authorId : user.id;

    if (this.isAdmin(user)) {
      await this.ensureAuthorExists(authorId);
    }

    return this.prisma.sessionNote.create({
      data: {
        ...createSessionNoteDto,
        authorId,
      },
    });
  }

  findAll(user: AuthenticatedUser) {
    return this.prisma.sessionNote.findMany({
      where: this.isAdmin(user)
        ? undefined
        : {
            caseFile: {
              patient: {
                psychologistId: user.id,
              },
            },
          },
      orderBy: {
        sessionDate: 'desc',
      },
    });
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const sessionNote = await this.getAccessibleSessionNoteOrThrow(id, user);

    return sessionNote;
  }

  async findByCaseFileId(caseFileId: string, user: AuthenticatedUser) {
    await this.getAccessibleCaseFileOrThrow(caseFileId, user);

    return this.prisma.sessionNote.findMany({
      where: { caseFileId },
      orderBy: {
        sessionDate: 'desc',
      },
    });
  }

  async update(
    id: string,
    updateSessionNoteDto: UpdateSessionNoteDto,
    user: AuthenticatedUser,
  ) {
    await this.getAccessibleSessionNoteOrThrow(id, user);

    return this.prisma.sessionNote.update({
      where: { id },
      data: updateSessionNoteDto,
    });
  }

  async remove(id: string, user: AuthenticatedUser) {
    await this.getAccessibleSessionNoteOrThrow(id, user);

    return this.prisma.sessionNote.delete({
      where: { id },
    });
  }

  private isAdmin(user: AuthenticatedUser) {
    return user.role === UserRole.ADMIN;
  }

  private async getAccessibleCaseFileOrThrow(
    caseFileId: string,
    user: AuthenticatedUser,
  ) {
    const caseFile = this.isAdmin(user)
      ? await this.prisma.caseFile.findUnique({ where: { id: caseFileId } })
      : await this.prisma.caseFile.findFirst({
          where: {
            id: caseFileId,
            patient: {
              psychologistId: user.id,
            },
          },
        });

    if (!caseFile) {
      throw new NotFoundException(`Case file with id "${caseFileId}" not found`);
    }

    return caseFile;
  }

  private async getAccessibleSessionNoteOrThrow(
    id: string,
    user: AuthenticatedUser,
  ) {
    const sessionNote = this.isAdmin(user)
      ? await this.prisma.sessionNote.findUnique({ where: { id } })
      : await this.prisma.sessionNote.findFirst({
          where: {
            id,
            caseFile: {
              patient: {
                psychologistId: user.id,
              },
            },
          },
        });

    if (!sessionNote) {
      throw new NotFoundException(`Session note with id "${id}" not found`);
    }

    return sessionNote;
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
