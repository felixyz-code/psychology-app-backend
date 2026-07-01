import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentsService } from './documents.service';
import { UploadDocumentDto } from './dto/upload-document.dto';

type PrismaMock = {
  caseFile: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
  };
  document: {
    create: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  user: {
    findUnique: jest.Mock;
  };
};

type DocumentCreateArgs = {
  data: {
    caseFileId: string;
    uploadedById: string;
    fileName: string;
    filePath: string;
    mimeType: string | null;
  };
};

const admin: AuthenticatedUser = {
  id: 'admin-id',
  name: 'Admin',
  email: 'admin@example.com',
  role: UserRole.ADMIN,
};

const psychologist: AuthenticatedUser = {
  id: 'psychologist-id',
  name: 'Psychologist',
  email: 'psychologist@example.com',
  role: UserRole.PSYCHOLOGIST,
};

const uploadRoot = join(process.cwd(), '.tmp-tests', 'documents-service');

function createFile(): Express.Multer.File {
  return {
    originalname: 'consent.pdf',
    mimetype: 'application/pdf',
    buffer: Buffer.from('test-file'),
  } as Express.Multer.File;
}

describe('DocumentsService', () => {
  let service: DocumentsService;
  let prisma: PrismaMock;
  const previousUploadsPath = process.env.UPLOADS_PATH;

  beforeEach(() => {
    process.env.UPLOADS_PATH = uploadRoot;

    prisma = {
      caseFile: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      document: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };

    service = new DocumentsService(prisma as unknown as PrismaService);
  });

  function getDocumentCreateArgs() {
    const call = prisma.document.create.mock.calls[0] as
      | [DocumentCreateArgs]
      | undefined;

    if (!call) {
      throw new Error('Expected document.create to be called');
    }

    return call[0];
  }

  afterEach(async () => {
    if (previousUploadsPath === undefined) {
      delete process.env.UPLOADS_PATH;
    } else {
      process.env.UPLOADS_PATH = previousUploadsPath;
    }

    await rm(join(process.cwd(), '.tmp-tests'), {
      recursive: true,
      force: true,
    });
  });

  it('uploads without uploadedById and assigns the authenticated user', async () => {
    prisma.caseFile.findUnique.mockResolvedValue({
      id: 'case-file-id',
      patientId: 'patient-id',
    });
    prisma.document.create.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve({
        id: 'document-id',
        ...data,
      }),
    );

    await service.upload({ caseFileId: 'case-file-id' }, createFile(), admin);

    expect(getDocumentCreateArgs().data).toMatchObject({
      caseFileId: 'case-file-id',
      uploadedById: admin.id,
      fileName: 'consent.pdf',
      mimeType: 'application/pdf',
    });
  });

  it('ignores a legacy uploadedById field when it is still sent', async () => {
    prisma.caseFile.findUnique.mockResolvedValue({
      id: 'case-file-id',
      patientId: 'patient-id',
    });
    prisma.document.create.mockResolvedValue({ id: 'document-id' });

    const legacyPayload = {
      caseFileId: 'case-file-id',
      uploadedById: 'legacy-user-id',
    } as unknown as UploadDocumentDto;

    await service.upload(legacyPayload, createFile(), admin);

    expect(getDocumentCreateArgs().data).toMatchObject({
      uploadedById: admin.id,
    });
  });

  it('keeps ownership checks before writing document metadata', async () => {
    prisma.caseFile.findFirst.mockResolvedValue(null);

    await expect(
      service.upload(
        { caseFileId: 'foreign-case-file-id' },
        createFile(),
        psychologist,
      ),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.document.create).not.toHaveBeenCalled();
  });
});
