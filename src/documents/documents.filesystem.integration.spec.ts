import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AppConfigService } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentsService } from './documents.service';

const admin: AuthenticatedUser = {
  id: 'admin-id',
  name: 'Admin',
  email: 'admin@example.test',
  role: UserRole.ADMIN,
};

describe('DocumentsService filesystem integration', () => {
  let uploadsPath: string;
  let service: DocumentsService;
  let prisma: {
    caseFile: { findUnique: jest.Mock };
    document: { create: jest.Mock; findUnique: jest.Mock; delete: jest.Mock };
  };

  beforeEach(async () => {
    uploadsPath = await mkdtemp(join(tmpdir(), 'psychology-be7-documents-'));
    prisma = {
      caseFile: {
        findUnique: jest.fn().mockResolvedValue({ patientId: 'p1' }),
      },
      document: {
        create: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new DocumentsService(
      prisma as unknown as PrismaService,
      { uploadsPath } as AppConfigService,
    );
  });

  afterEach(async () => {
    await rm(uploadsPath, { recursive: true, force: true });
  });

  it('removes a freshly written file when document metadata creation fails', async () => {
    prisma.document.create.mockRejectedValue(new Error('database unavailable'));

    await expect(
      service.upload(
        { caseFileId: 'case-file-id' },
        {
          originalname: 'consent.pdf',
          mimetype: 'application/pdf',
          buffer: Buffer.from('%PDF-1.7'),
        } as Express.Multer.File,
        admin,
      ),
    ).rejects.toThrow('database unavailable');

    expect(await readdir(join(uploadsPath, 'patients', 'p1'))).toEqual([]);
  });

  it('preserves a file when metadata deletion fails', async () => {
    const directory = join(uploadsPath, 'patients', 'p1');
    const filePath = join(directory, 'document.pdf');
    await mkdir(directory, { recursive: true });
    await writeFile(filePath, 'document', { flag: 'w' });
    prisma.document.findUnique.mockResolvedValue({
      id: 'document-id',
      filePath,
    });
    prisma.document.delete.mockRejectedValue(new Error('database unavailable'));

    await expect(service.remove('document-id', admin)).rejects.toThrow(
      'database unavailable',
    );
    await expect(access(filePath)).resolves.toBeUndefined();
  });

  it('removes a file after metadata deletion succeeds', async () => {
    const directory = join(uploadsPath, 'patients', 'p1');
    const filePath = join(directory, 'document.pdf');
    await mkdir(directory, { recursive: true });
    await writeFile(filePath, 'document', { flag: 'w' });
    prisma.document.findUnique.mockResolvedValue({
      id: 'document-id',
      filePath,
    });
    prisma.document.delete.mockResolvedValue({ id: 'document-id' });

    await expect(service.remove('document-id', admin)).resolves.toEqual({
      id: 'document-id',
    });
    await expect(access(filePath)).rejects.toThrow();
  });
});
