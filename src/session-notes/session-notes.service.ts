import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClinicalAccessPolicyService } from '../tenant-context/clinical-access-policy.service';
import type { ClinicalAccessScope } from '../tenant-context/clinical-access.types';
import { OrganizationCapability } from '../tenant-context/authorization/organization-capability';
import { CreateSessionNoteDto } from './dto/create-session-note.dto';
import { UpdateSessionNoteDto } from './dto/update-session-note.dto';

@Injectable()
export class SessionNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clinicalPolicy: ClinicalAccessPolicyService,
  ) {}

  async create(
    createSessionNoteDto: CreateSessionNoteDto,
    scope: ClinicalAccessScope,
  ) {
    const caseFile = await this.getVisibleCaseFileOrThrow(
      createSessionNoteDto.caseFileId,
      scope,
    );
    this.clinicalPolicy.requireCapability(
      scope,
      OrganizationCapability.SESSION_NOTE_CREATE,
      'session_notes.create',
    );
    await this.requireAssignment(caseFile.patientId, scope);

    return this.prisma.sessionNote.create({
      data: {
        ...this.withoutServerFields(createSessionNoteDto),
        organizationId: scope.organizationId,
        authorId: scope.userId,
      },
    });
  }

  findAll(scope: ClinicalAccessScope) {
    this.clinicalPolicy.requireCapability(
      scope,
      OrganizationCapability.SESSION_NOTE_READ,
      'session_notes.find_all',
    );

    return this.prisma.sessionNote.findMany({
      where: {
        organizationId: scope.organizationId,
        caseFile: {
          organizationId: scope.organizationId,
          patient: this.clinicalPolicy.assignedPatientWhere(scope),
        },
      },
      orderBy: {
        sessionDate: 'desc',
      },
    });
  }

  async findOne(id: string, scope: ClinicalAccessScope) {
    const sessionNote = await this.getVisibleSessionNoteOrThrow(id, scope);
    this.clinicalPolicy.requireCapability(
      scope,
      OrganizationCapability.SESSION_NOTE_READ,
      'session_notes.find_one',
    );
    await this.requireAssignment(sessionNote.caseFile.patientId, scope);

    return stripSessionNoteRelations(sessionNote);
  }

  async findByCaseFileId(caseFileId: string, scope: ClinicalAccessScope) {
    const caseFile = await this.getVisibleCaseFileOrThrow(caseFileId, scope);
    this.clinicalPolicy.requireCapability(
      scope,
      OrganizationCapability.SESSION_NOTE_READ,
      'session_notes.find_by_case_file',
    );
    await this.requireAssignment(caseFile.patientId, scope);

    return this.prisma.sessionNote.findMany({
      where: {
        caseFileId,
        organizationId: scope.organizationId,
      },
      orderBy: {
        sessionDate: 'desc',
      },
    });
  }

  async update(
    id: string,
    updateSessionNoteDto: UpdateSessionNoteDto,
    scope: ClinicalAccessScope,
  ) {
    const sessionNote = await this.getVisibleSessionNoteOrThrow(id, scope);
    this.clinicalPolicy.requireCapability(
      scope,
      OrganizationCapability.SESSION_NOTE_UPDATE,
      'session_notes.update',
    );
    await this.requireAssignment(sessionNote.caseFile.patientId, scope);

    const result = await this.prisma.sessionNote.updateMany({
      where: {
        id,
        organizationId: scope.organizationId,
        caseFile: {
          organizationId: scope.organizationId,
          patient: this.clinicalPolicy.assignedPatientWhere(scope),
        },
      },
      data: this.withoutServerFields(updateSessionNoteDto),
    });

    if (result.count !== 1) {
      throw this.sessionNoteNotFound();
    }

    return this.getAssignedSessionNoteOrThrow(id, scope);
  }

  async remove(id: string, scope: ClinicalAccessScope) {
    const sessionNote = await this.getVisibleSessionNoteOrThrow(id, scope);
    this.clinicalPolicy.requireCapability(
      scope,
      OrganizationCapability.SESSION_NOTE_DELETE,
      'session_notes.remove',
    );
    await this.requireAssignment(sessionNote.caseFile.patientId, scope);

    const result = await this.prisma.sessionNote.deleteMany({
      where: {
        id,
        organizationId: scope.organizationId,
        caseFile: {
          organizationId: scope.organizationId,
          patient: this.clinicalPolicy.assignedPatientWhere(scope),
        },
      },
    });

    if (result.count !== 1) {
      throw this.sessionNoteNotFound();
    }

    return stripSessionNoteRelations(sessionNote);
  }

  private async getVisibleCaseFileOrThrow(
    caseFileId: string,
    scope: ClinicalAccessScope,
  ) {
    const caseFile = await this.prisma.caseFile.findFirst({
      where: {
        id: caseFileId,
        organizationId: scope.organizationId,
        patient: this.clinicalPolicy.tenantPatientWhere(scope),
      },
      select: { id: true, patientId: true },
    });

    if (!caseFile) {
      throw new NotFoundException('Case file not found');
    }

    return caseFile;
  }

  private async getVisibleSessionNoteOrThrow(
    id: string,
    scope: ClinicalAccessScope,
  ) {
    const sessionNote = await this.prisma.sessionNote.findFirst({
      where: {
        id,
        organizationId: scope.organizationId,
        caseFile: {
          organizationId: scope.organizationId,
          patient: this.clinicalPolicy.tenantPatientWhere(scope),
        },
      },
      include: { caseFile: { select: { patientId: true } } },
    });

    if (!sessionNote) {
      throw this.sessionNoteNotFound();
    }

    return sessionNote;
  }

  private async getAssignedSessionNoteOrThrow(
    id: string,
    scope: ClinicalAccessScope,
  ) {
    const sessionNote = await this.prisma.sessionNote.findFirst({
      where: {
        id,
        organizationId: scope.organizationId,
        caseFile: {
          organizationId: scope.organizationId,
          patient: this.clinicalPolicy.assignedPatientWhere(scope),
        },
      },
    });

    if (!sessionNote) {
      throw this.sessionNoteNotFound();
    }

    return sessionNote;
  }

  private async requireAssignment(
    patientId: string,
    scope: ClinicalAccessScope,
  ) {
    const assignment = await this.prisma.patientAssignment.findFirst({
      where: {
        ...this.clinicalPolicy.assignmentWhere(scope),
        patientId,
        patient: this.clinicalPolicy.tenantPatientWhere(scope),
      },
      select: { id: true },
    });

    if (!assignment) {
      throw new ForbiddenException('Clinical assignment is required');
    }
  }

  private withoutServerFields<T extends object>(
    dto: T,
  ): Omit<T, 'organizationId' | 'authorId'> {
    const noteData = { ...dto };
    Reflect.deleteProperty(noteData, 'organizationId');
    Reflect.deleteProperty(noteData, 'authorId');
    return noteData;
  }

  private sessionNoteNotFound() {
    return new NotFoundException('Session note not found');
  }
}

type AuthorizedSessionNote = Prisma.SessionNoteGetPayload<{
  include: { caseFile: { select: { patientId: true } } };
}>;

function stripSessionNoteRelations(sessionNote: AuthorizedSessionNote) {
  const metadata = { ...sessionNote };
  Reflect.deleteProperty(metadata, 'caseFile');
  return metadata;
}
