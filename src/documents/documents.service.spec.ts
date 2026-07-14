import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AppConfigService } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentsService } from './documents.service';
import { UploadDocumentDto } from './dto/upload-document.dto';

jest.mock('node:fs/promises', () => {
  const actual =
    jest.requireActual<typeof import('node:fs/promises')>('node:fs/promises');

  return {
    ...actual,
    access: jest.fn(),
    mkdir: jest.fn(),
    writeFile: jest.fn(),
  };
});

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

  beforeEach(() => {
    jest.clearAllMocks();
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

    service = new DocumentsService(
      prisma as unknown as PrismaService,
      { uploadsPath: uploadRoot } as AppConfigService,
    );
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

  it('does not touch the filesystem or metadata when psychologist A uploads under case file B', async () => {
    prisma.caseFile.findFirst.mockResolvedValue(null);

    await expect(
      service.upload(
        { caseFileId: 'case-file-b-id' },
        createFile(),
        psychologist,
      ),
    ).rejects.toThrow(NotFoundException);

    expect(mkdir).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  it('does not create metadata under a foreign case file', async () => {
    prisma.caseFile.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        {
          caseFileId: 'case-file-b-id',
          uploadedById: 'psychologist-b-id',
          fileName: 'foreign.pdf',
          filePath: 'uploads/patients/patient-b-id/foreign.pdf',
        },
        psychologist,
      ),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  it('filters lists and metadata reads through the owning patient relation', async () => {
    prisma.document.findMany.mockResolvedValue([]);
    prisma.document.findFirst.mockResolvedValue(null);

    await service.findAll(psychologist);
    await expect(
      service.findOne('document-b-id', psychologist),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.document.findMany).toHaveBeenCalledWith({
      where: {
        caseFile: { patient: { psychologistId: psychologist.id } },
      },
      orderBy: { uploadedAt: 'desc' },
    });
    expect(prisma.document.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'document-b-id',
        caseFile: { patient: { psychologistId: psychologist.id } },
      },
    });
  });

  it('blocks foreign download and view before filesystem access', async () => {
    prisma.document.findFirst.mockResolvedValue(null);

    await expect(
      service.getDownloadFile('document-b-id', psychologist),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.getViewFile('document-b-id', psychologist),
    ).rejects.toThrow(NotFoundException);

    expect(access).not.toHaveBeenCalled();
  });

  it('blocks foreign metadata update and delete before mutations', async () => {
    prisma.document.findFirst.mockResolvedValue(null);

    await expect(
      service.update(
        'document-b-id',
        { fileName: 'changed.pdf' },
        psychologist,
      ),
    ).rejects.toThrow(NotFoundException);
    await expect(service.remove('document-b-id', psychologist)).rejects.toThrow(
      NotFoundException,
    );

    expect(prisma.document.update).not.toHaveBeenCalled();
    expect(prisma.document.delete).not.toHaveBeenCalled();
  });

  it('keeps admin global access to document metadata', async () => {
    prisma.document.findUnique.mockResolvedValue({ id: 'document-b-id' });

    await expect(service.findOne('document-b-id', admin)).resolves.toEqual({
      id: 'document-b-id',
    });
    expect(prisma.document.findUnique).toHaveBeenCalledWith({
      where: { id: 'document-b-id' },
    });
  });
});
