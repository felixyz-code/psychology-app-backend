import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  access,
  mkdir,
  realpath,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { join, relative } from 'node:path';
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
    realpath: jest.fn(),
    unlink: jest.fn(),
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

function createFile(
  overrides: Partial<
    Pick<Express.Multer.File, 'buffer' | 'mimetype' | 'originalname'>
  > = {},
): Express.Multer.File {
  return {
    originalname: 'consent.pdf',
    mimetype: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7'),
    ...overrides,
  } as Express.Multer.File;
}

describe('DocumentsService', () => {
  let service: DocumentsService;
  let prisma: PrismaMock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest
      .mocked(realpath)
      .mockImplementation((filePath) => Promise.resolve(filePath.toString()));
    jest.mocked(unlink).mockResolvedValue(undefined);
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

  it('removes the newly written file when metadata persistence fails', async () => {
    prisma.caseFile.findUnique.mockResolvedValue({
      id: 'case-file-id',
      patientId: 'patient-id',
    });
    prisma.document.create.mockRejectedValue(new Error('database unavailable'));

    await expect(
      service.upload({ caseFileId: 'case-file-id' }, createFile(), admin),
    ).rejects.toThrow('database unavailable');

    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining('patients'),
      expect.any(Buffer),
      { flag: 'wx' },
    );
    expect(unlink).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'PDF',
      createFile({
        originalname: 'consent.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('%PDF-1.7'),
      }),
    ],
    [
      'JPEG',
      createFile({
        originalname: 'photo.jpg',
        mimetype: 'image/jpeg',
        buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      }),
    ],
    [
      'PNG',
      createFile({
        originalname: 'scan.png',
        mimetype: 'image/png',
        buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      }),
    ],
  ])('accepts a %s file with a valid signature', async (_format, file) => {
    prisma.caseFile.findUnique.mockResolvedValue({
      id: 'case-file-id',
      patientId: 'patient-id',
    });
    prisma.document.create.mockResolvedValue({ id: 'document-id' });

    await expect(
      service.upload({ caseFileId: 'case-file-id' }, file, admin),
    ).resolves.toEqual({ id: 'document-id' });
  });

  it('rejects a PDF extension whose content is not a PDF before persistence', async () => {
    prisma.caseFile.findUnique.mockResolvedValue({
      id: 'case-file-id',
      patientId: 'patient-id',
    });

    await expect(
      service.upload(
        { caseFileId: 'case-file-id' },
        createFile({ buffer: Buffer.from('not a document') }),
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mkdir).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  it('rejects a declared PDF MIME type when the content is PNG', async () => {
    prisma.caseFile.findUnique.mockResolvedValue({
      id: 'case-file-id',
      patientId: 'patient-id',
    });

    await expect(
      service.upload(
        { caseFileId: 'case-file-id' },
        createFile({
          buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        }),
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  it('rejects a file shorter than every accepted signature', async () => {
    prisma.caseFile.findUnique.mockResolvedValue({
      id: 'case-file-id',
      patientId: 'patient-id',
    });

    await expect(
      service.upload(
        { caseFileId: 'case-file-id' },
        createFile({ buffer: Buffer.from('%PD') }),
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(mkdir).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    expect(prisma.document.create).not.toHaveBeenCalled();
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
    expect(unlink).not.toHaveBeenCalled();
  });

  it('deletes metadata before best-effort physical cleanup', async () => {
    const absoluteFilePath = join(
      uploadRoot,
      'patients',
      'patient-id',
      'document-id.pdf',
    );
    const document = {
      id: 'document-id',
      filePath: relative(process.cwd(), absoluteFilePath),
    };
    const deletionOrder: string[] = [];
    prisma.document.findUnique.mockResolvedValue(document);
    prisma.document.delete.mockImplementation(() => {
      deletionOrder.push('metadata');
      return Promise.resolve(document);
    });
    jest.mocked(unlink).mockImplementation(() => {
      deletionOrder.push('file');
      return Promise.resolve();
    });

    await expect(service.remove(document.id, admin)).resolves.toEqual(document);

    expect(unlink).toHaveBeenCalledWith(absoluteFilePath);
    expect(prisma.document.delete).toHaveBeenCalledWith({
      where: { id: document.id },
    });
    expect(deletionOrder).toEqual(['metadata', 'file']);
  });

  it('deletes metadata when the physical file is already absent', async () => {
    const absoluteFilePath = join(uploadRoot, 'missing.pdf');
    const document = {
      id: 'document-id',
      filePath: relative(process.cwd(), absoluteFilePath),
    };
    prisma.document.findUnique.mockResolvedValue(document);
    prisma.document.delete.mockResolvedValue(document);
    jest.mocked(unlink).mockRejectedValue({ code: 'ENOENT' });

    await expect(service.remove(document.id, admin)).resolves.toEqual(document);

    expect(prisma.document.delete).toHaveBeenCalledWith({
      where: { id: document.id },
    });
  });

  it('does not delete the physical file when metadata deletion fails', async () => {
    const document = {
      id: 'document-id',
      filePath: relative(process.cwd(), join(uploadRoot, 'document-id.pdf')),
    };
    prisma.document.findUnique.mockResolvedValue(document);
    prisma.document.delete.mockRejectedValue(new Error('database unavailable'));

    await expect(service.remove(document.id, admin)).rejects.toThrow(
      'database unavailable',
    );

    expect(unlink).not.toHaveBeenCalled();
  });

  it('preserves the successful metadata delete when cleanup rejects an out-of-root path', async () => {
    prisma.document.findUnique.mockResolvedValue({
      id: 'document-id',
      filePath: join(process.cwd(), 'outside.pdf'),
    });

    prisma.document.delete.mockResolvedValue({ id: 'document-id' });

    await expect(service.remove('document-id', admin)).resolves.toEqual({
      id: 'document-id',
    });

    expect(unlink).not.toHaveBeenCalled();
    expect(prisma.document.delete).toHaveBeenCalled();
  });

  it('preserves the successful metadata delete when cleanup detects a symlink escape', async () => {
    const absoluteFilePath = join(uploadRoot, 'linked.pdf');
    prisma.document.findUnique.mockResolvedValue({
      id: 'document-id',
      filePath: relative(process.cwd(), absoluteFilePath),
    });
    jest
      .mocked(realpath)
      .mockImplementation((filePath) =>
        Promise.resolve(
          filePath === uploadRoot
            ? uploadRoot
            : join(process.cwd(), 'outside-target.pdf'),
        ),
      );

    prisma.document.delete.mockResolvedValue({ id: 'document-id' });

    await expect(service.remove('document-id', admin)).resolves.toEqual({
      id: 'document-id',
    });

    expect(unlink).not.toHaveBeenCalled();
    expect(prisma.document.delete).toHaveBeenCalled();
  });

  it('preserves the successful metadata delete when filesystem cleanup fails unexpectedly', async () => {
    const absoluteFilePath = join(uploadRoot, 'protected.pdf');
    prisma.document.findUnique.mockResolvedValue({
      id: 'document-id',
      filePath: relative(process.cwd(), absoluteFilePath),
    });
    jest.mocked(unlink).mockRejectedValue({ code: 'EACCES' });

    prisma.document.delete.mockResolvedValue({ id: 'document-id' });

    await expect(service.remove('document-id', admin)).resolves.toEqual({
      id: 'document-id',
    });

    expect(prisma.document.delete).toHaveBeenCalled();
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
