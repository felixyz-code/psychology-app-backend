import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import {
  access,
  mkdir,
  realpath,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { join, relative } from 'node:path';
import {
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  PatientAssignmentStatus,
  UserRole,
} from '@prisma/client';
import { TenantResolutionMode } from '../common/request-context/request-context.service';
import { AppConfigService } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { ClinicalAccessPolicyService } from '../tenant-context/clinical-access-policy.service';
import type { ClinicalAccessScope } from '../tenant-context/clinical-access.types';
import { OrganizationCapability } from '../tenant-context/authorization/organization-capability';
import { DocumentsService } from './documents.service';

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
  caseFile: { findFirst: jest.Mock };
  document: {
    create: jest.Mock;
    deleteMany: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
  patientAssignment: { findFirst: jest.Mock };
};

const scope: ClinicalAccessScope = {
  organizationId: 'organization-a-id',
  membershipId: 'membership-a-id',
  organizationRole: MembershipRole.PSYCHOLOGIST,
  userId: 'psychologist-a-id',
  legacyUserRole: UserRole.PSYCHOLOGIST,
  resolutionMode: TenantResolutionMode.EXPLICIT,
};
const uploadRoot = join(process.cwd(), '.tmp-tests', 'documents-service');

describe('DocumentsService D2 tenant-aware policy', () => {
  let service: DocumentsService;
  let prisma: PrismaMock;
  let loggerErrorSpy: jest.SpyInstance;
  let clinicalPolicy: jest.Mocked<
    Pick<
      ClinicalAccessPolicyService,
      | 'requireCapability'
      | 'tenantPatientWhere'
      | 'assignedPatientWhere'
      | 'assignmentWhere'
    >
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest
      .mocked(realpath)
      .mockImplementation((filePath) => Promise.resolve(filePath.toString()));
    jest.mocked(unlink).mockResolvedValue(undefined);
    prisma = {
      caseFile: { findFirst: jest.fn() },
      document: {
        create: jest.fn(),
        deleteMany: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      patientAssignment: { findFirst: jest.fn() },
    };
    clinicalPolicy = {
      requireCapability: jest.fn(),
      tenantPatientWhere: jest.fn(tenantPatientWhere),
      assignedPatientWhere: jest.fn(assignedPatientWhere),
      assignmentWhere: jest.fn(assignmentWhere),
    };
    service = new DocumentsService(
      prisma as unknown as PrismaService,
      { uploadsPath: uploadRoot } as AppConfigService,
      clinicalPolicy as unknown as ClinicalAccessPolicyService,
    );
  });

  afterEach(async () => {
    await rm(join(process.cwd(), '.tmp-tests'), {
      recursive: true,
      force: true,
    });
  });

  it('uploads only after tenant visibility, capability and assignment checks', async () => {
    prisma.caseFile.findFirst.mockResolvedValue({
      id: 'case-file-id',
      patientId: 'patient-a-id',
    });
    prisma.patientAssignment.findFirst.mockResolvedValue({
      id: 'assignment-id',
    });
    prisma.document.create.mockResolvedValue({ id: 'document-id' });

    await service.upload(
      { caseFileId: 'case-file-id', uploadedById: 'attacker-id' } as never,
      createFile(),
      scope,
    );

    expect(clinicalPolicy.requireCapability).toHaveBeenCalledWith(
      scope,
      OrganizationCapability.DOCUMENT_UPLOAD,
      'documents.upload',
    );
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining(join('patients', 'patient-a-id')),
      expect.any(Buffer),
      { flag: 'wx' },
    );
    const documentCreateCalls = prisma.document.create.mock.calls as Array<
      [unknown]
    >;
    const createArgs = documentCreateCalls[0]?.[0] as
      | { data: Record<string, unknown> }
      | undefined;
    expect(createArgs?.data).toMatchObject({
      caseFileId: 'case-file-id',
      organizationId: scope.organizationId,
      uploadedById: scope.userId,
      fileName: 'consent.pdf',
      mimeType: 'application/pdf',
    });
    expect(createArgs?.data.filePath).toEqual(
      expect.stringMatching(/^patients\/patient-a-id\/.+\.pdf$/),
    );
    expect(String(createArgs?.data.filePath)).not.toContain('..');
  });

  it('does not touch filesystem or metadata for a cross-tenant upload', async () => {
    prisma.caseFile.findFirst.mockResolvedValue(null);

    await expect(
      service.upload({ caseFileId: 'case-file-b-id' }, createFile(), scope),
    ).rejects.toEqual(new NotFoundException('Case file not found'));
    expect(mkdir).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  it('rejects invalid content before filesystem writes', async () => {
    prisma.caseFile.findFirst.mockResolvedValue({
      id: 'case-file-id',
      patientId: 'patient-a-id',
    });
    prisma.patientAssignment.findFirst.mockResolvedValue({
      id: 'assignment-id',
    });

    await expect(
      service.upload(
        { caseFileId: 'case-file-id' },
        createFile({ buffer: Buffer.from('not-pdf') }),
        scope,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(writeFile).not.toHaveBeenCalled();
    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  it.each([
    ['parent traversal', '../outside.pdf'],
    ['nested parent traversal', 'patients/patient-a-id/../outside.pdf'],
    ['encoded traversal', 'patients/patient-a-id/%2e%2e/outside.pdf'],
    ['absolute path', join(uploadRoot, 'patients', 'patient-a-id', 'x.pdf')],
    ['null byte', 'patients/patient-a-id/x.pdf\0'],
  ])('rejects metadata %s storage keys', async (_caseName, filePath) => {
    prisma.caseFile.findFirst.mockResolvedValue({
      id: 'case-file-id',
      patientId: 'patient-a-id',
    });
    prisma.patientAssignment.findFirst.mockResolvedValue({
      id: 'assignment-id',
    });

    await expect(
      service.create(
        {
          caseFileId: 'case-file-id',
          uploadedById: 'attacker-id',
          fileName: 'blocked.pdf',
          filePath,
          mimeType: 'application/pdf',
        },
        scope,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  it('lists and reads metadata only through assigned in-tenant case files', async () => {
    prisma.document.findMany.mockResolvedValue([]);
    prisma.document.findFirst.mockResolvedValue(null);

    await service.findAll(scope);
    await expect(service.findOne('document-b-id', scope)).rejects.toEqual(
      new NotFoundException('Document not found'),
    );

    expect(prisma.document.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: scope.organizationId,
        caseFile: {
          organizationId: scope.organizationId,
          patient: assignedPatientWhere(scope),
        },
      },
      orderBy: { uploadedAt: 'desc' },
    });
    expect(prisma.document.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'document-b-id',
        organizationId: scope.organizationId,
        caseFile: {
          organizationId: scope.organizationId,
          patient: tenantPatientWhere(scope),
        },
      },
      include: { caseFile: { select: { patientId: true } } },
    });
  });

  it('blocks cross-tenant download and view before filesystem access', async () => {
    prisma.document.findFirst.mockResolvedValue(null);

    await expect(
      service.getDownloadFile('document-b-id', scope),
    ).rejects.toEqual(new NotFoundException('Document not found'));
    await expect(service.getViewFile('document-b-id', scope)).rejects.toEqual(
      new NotFoundException('Document not found'),
    );
    expect(access).not.toHaveBeenCalled();
  });

  it('returns a sanitized missing-file error for authorized metadata without a blob', async () => {
    prisma.document.findFirst.mockResolvedValue(documentWithRelation());
    prisma.patientAssignment.findFirst.mockResolvedValue({
      id: 'assignment-id',
    });
    jest.mocked(access).mockRejectedValueOnce({ code: 'ENOENT' });

    await expect(service.getDownloadFile('document-id', scope)).rejects.toEqual(
      new NotFoundException('Document file not found'),
    );
  });

  it('updates only assigned document metadata and strips server fields', async () => {
    prisma.document.findFirst
      .mockResolvedValueOnce(documentWithRelation())
      .mockResolvedValueOnce({ id: 'document-id', fileName: 'updated.pdf' });
    prisma.patientAssignment.findFirst.mockResolvedValue({
      id: 'assignment-id',
    });
    prisma.document.updateMany.mockResolvedValue({ count: 1 });

    await service.update(
      'document-id',
      {
        fileName: 'updated.pdf',
        uploadedById: 'attacker-id',
        organizationId: 'organization-b-id',
      } as never,
      scope,
    );

    expect(prisma.document.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'document-id',
        organizationId: scope.organizationId,
        caseFile: {
          organizationId: scope.organizationId,
          patient: assignedPatientWhere(scope),
        },
      },
      data: { fileName: 'updated.pdf' },
    });
  });

  it('deletes metadata before sanitized best-effort blob cleanup', async () => {
    const deleted: string[] = [];
    prisma.document.findFirst.mockResolvedValue(documentWithRelation());
    prisma.patientAssignment.findFirst.mockResolvedValue({
      id: 'assignment-id',
    });
    prisma.document.deleteMany.mockImplementation(() => {
      deleted.push('metadata');
      return Promise.resolve({ count: 1 });
    });
    jest.mocked(unlink).mockImplementation(() => {
      deleted.push('blob');
      return Promise.resolve();
    });

    await expect(service.remove('document-id', scope)).resolves.toEqual({
      id: 'document-id',
      caseFileId: 'case-file-id',
      organizationId: scope.organizationId,
      uploadedById: scope.userId,
      fileName: 'consent.pdf',
      filePath: relative(
        uploadRoot,
        join(uploadRoot, 'patients', 'patient-a-id', 'consent.pdf'),
      ),
      mimeType: 'application/pdf',
    });
    expect(deleted).toEqual(['metadata', 'blob']);
  });

  it('preserves metadata delete result when blob cleanup fails', async () => {
    prisma.document.findFirst.mockResolvedValue(documentWithRelation());
    prisma.patientAssignment.findFirst.mockResolvedValue({
      id: 'assignment-id',
    });
    prisma.document.deleteMany.mockResolvedValue({ count: 1 });
    jest.mocked(unlink).mockRejectedValue({ code: 'EACCES' });

    await expect(service.remove('document-id', scope)).resolves.toEqual(
      expect.objectContaining({ id: 'document-id' }),
    );
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('document_cleanup_failed'),
    );
  });
});

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

function documentWithRelation() {
  return {
    id: 'document-id',
    caseFileId: 'case-file-id',
    organizationId: scope.organizationId,
    uploadedById: scope.userId,
    fileName: 'consent.pdf',
    filePath: relative(
      uploadRoot,
      join(uploadRoot, 'patients', 'patient-a-id', 'consent.pdf'),
    ),
    mimeType: 'application/pdf',
    caseFile: { patientId: 'patient-a-id' },
  };
}

function tenantPatientWhere(activeScope: ClinicalAccessScope) {
  return {
    organizationId: activeScope.organizationId,
    psychologistId: activeScope.userId,
  };
}

function assignmentWhere(activeScope: ClinicalAccessScope) {
  return {
    organizationId: activeScope.organizationId,
    membershipId: activeScope.membershipId,
    status: PatientAssignmentStatus.ACTIVE,
    membership: {
      organizationId: activeScope.organizationId,
      userId: activeScope.userId,
      status: MembershipStatus.ACTIVE,
      organization: { status: OrganizationStatus.ACTIVE },
    },
  };
}

function assignedPatientWhere(activeScope: ClinicalAccessScope) {
  return {
    ...tenantPatientWhere(activeScope),
    assignments: { some: assignmentWhere(activeScope) },
  };
}
