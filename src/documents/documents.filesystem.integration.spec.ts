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
import { DocumentsService } from './documents.service';

const scope: ClinicalAccessScope = {
  organizationId: 'organization-a-id',
  membershipId: 'membership-a-id',
  organizationRole: MembershipRole.PSYCHOLOGIST,
  userId: 'psychologist-a-id',
  legacyUserRole: UserRole.PSYCHOLOGIST,
  resolutionMode: TenantResolutionMode.EXPLICIT,
};

describe('DocumentsService filesystem integration', () => {
  let uploadsPath: string;
  let service: DocumentsService;
  let prisma: {
    caseFile: { findFirst: jest.Mock };
    document: {
      create: jest.Mock;
      deleteMany: jest.Mock;
      findFirst: jest.Mock;
    };
    patientAssignment: { findFirst: jest.Mock };
  };
  let clinicalPolicy: Pick<
    ClinicalAccessPolicyService,
    | 'requireCapability'
    | 'tenantPatientWhere'
    | 'assignedPatientWhere'
    | 'assignmentWhere'
  >;

  beforeEach(async () => {
    uploadsPath = await mkdtemp(join(tmpdir(), 'psychology-be7-documents-'));
    prisma = {
      caseFile: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'case-file-id',
          patientId: 'p1',
        }),
      },
      document: {
        create: jest.fn(),
        deleteMany: jest.fn(),
        findFirst: jest.fn(),
      },
      patientAssignment: {
        findFirst: jest.fn().mockResolvedValue({ id: 'assignment-id' }),
      },
    };
    clinicalPolicy = {
      requireCapability: jest.fn(),
      tenantPatientWhere,
      assignedPatientWhere,
      assignmentWhere,
    };
    service = new DocumentsService(
      prisma as unknown as PrismaService,
      { uploadsPath } as AppConfigService,
      clinicalPolicy as ClinicalAccessPolicyService,
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
        scope,
      ),
    ).rejects.toThrow('database unavailable');

    expect(await readdir(join(uploadsPath, 'patients', 'p1'))).toEqual([]);
  });

  it('preserves a file when metadata deletion fails', async () => {
    const directory = join(uploadsPath, 'patients', 'p1');
    const filePath = join(directory, 'document.pdf');
    await mkdir(directory, { recursive: true });
    await writeFile(filePath, 'document', { flag: 'w' });
    prisma.document.findFirst.mockResolvedValue(document(filePath));
    prisma.document.deleteMany.mockRejectedValue(
      new Error('database unavailable'),
    );

    await expect(service.remove('document-id', scope)).rejects.toThrow(
      'database unavailable',
    );
    await expect(access(filePath)).resolves.toBeUndefined();
  });

  it('removes a file after metadata deletion succeeds', async () => {
    const directory = join(uploadsPath, 'patients', 'p1');
    const filePath = join(directory, 'document.pdf');
    await mkdir(directory, { recursive: true });
    await writeFile(filePath, 'document', { flag: 'w' });
    prisma.document.findFirst.mockResolvedValue(document(filePath));
    prisma.document.deleteMany.mockResolvedValue({ count: 1 });

    await expect(service.remove('document-id', scope)).resolves.toEqual(
      expect.objectContaining({ id: 'document-id' }),
    );
    await expect(access(filePath)).rejects.toThrow();
  });
});

function document(filePath: string) {
  return {
    id: 'document-id',
    caseFileId: 'case-file-id',
    organizationId: scope.organizationId,
    uploadedById: scope.userId,
    fileName: 'document.pdf',
    filePath,
    mimeType: 'application/pdf',
    caseFile: { patientId: 'p1' },
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
