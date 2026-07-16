import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { SessionNotesService } from './session-notes.service';

type PrismaMock = {
  caseFile: { findFirst: jest.Mock; findUnique: jest.Mock };
  sessionNote: {
    create: jest.Mock;
    delete: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  user: { findUnique: jest.Mock };
};

const admin: AuthenticatedUser = {
  id: 'admin-id',
  name: 'Admin',
  email: 'admin@example.test',
  role: UserRole.ADMIN,
};
const psychologistA: AuthenticatedUser = {
  id: 'psychologist-a-id',
  name: 'Psychologist A',
  email: 'a@example.test',
  role: UserRole.PSYCHOLOGIST,
};

describe('SessionNotesService ownership', () => {
  let service: SessionNotesService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = {
      caseFile: { findFirst: jest.fn(), findUnique: jest.fn() },
      sessionNote: {
        create: jest.fn(),
        delete: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: { findUnique: jest.fn() },
    };
    service = new SessionNotesService(prisma as unknown as PrismaService);
  });

  it('filters lists through case file and patient ownership', async () => {
    prisma.sessionNote.findMany.mockResolvedValue([]);

    await service.findAll(psychologistA);

    expect(prisma.sessionNote.findMany).toHaveBeenCalledWith({
      where: { caseFile: { patient: { psychologistId: psychologistA.id } } },
      orderBy: { sessionDate: 'desc' },
    });
  });

  it('prevents creating a note under psychologist B case file', async () => {
    prisma.caseFile.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        {
          caseFileId: 'case-file-b-id',
          authorId: 'psychologist-b-id',
          content: 'test',
          sessionDate: new Date(),
        },
        psychologistA,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.caseFile.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'case-file-b-id',
        patient: { psychologistId: psychologistA.id },
      },
    });
    expect(prisma.sessionNote.create).not.toHaveBeenCalled();
  });

  it('returns 404 and does not update or delete note B', async () => {
    prisma.sessionNote.findFirst.mockResolvedValue(null);

    await expect(
      service.findOne('note-b-id', psychologistA),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.update('note-b-id', { title: 'Changed' }, psychologistA),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.remove('note-b-id', psychologistA),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.sessionNote.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'note-b-id',
        caseFile: { patient: { psychologistId: psychologistA.id } },
      },
    });
    expect(prisma.sessionNote.update).not.toHaveBeenCalled();
    expect(prisma.sessionNote.delete).not.toHaveBeenCalled();
  });

  it('validates case file ownership before listing notes by relation', async () => {
    prisma.caseFile.findFirst.mockResolvedValue(null);

    await expect(
      service.findByCaseFileId('case-file-b-id', psychologistA),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.sessionNote.findMany).not.toHaveBeenCalled();
  });

  it('keeps admin global access', async () => {
    prisma.sessionNote.findMany.mockResolvedValue([]);
    prisma.sessionNote.findUnique.mockResolvedValue({ id: 'note-b-id' });

    await service.findAll(admin);
    await expect(service.findOne('note-b-id', admin)).resolves.toEqual({
      id: 'note-b-id',
    });

    expect(prisma.sessionNote.findMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: { sessionDate: 'desc' },
    });
    expect(prisma.sessionNote.findUnique).toHaveBeenCalledWith({
      where: { id: 'note-b-id' },
    });
  });
});
