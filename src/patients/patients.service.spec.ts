import { NotFoundException } from '@nestjs/common';
import { DocumentsService } from '../documents/documents.service';
import { PrismaService } from '../prisma/prisma.service';
import { PatientsService } from './patients.service';
import { PatientAccessScope } from './types/patient-access-scope.type';

type PrismaMock = {
  patient: {
    create: jest.Mock;
    deleteMany: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
  document: { findMany: jest.Mock };
};

const scopeA: PatientAccessScope = {
  organizationId: 'organization-a-id',
  psychologistId: 'psychologist-a-id',
};
const scopeSameOrganizationOtherPsychologist: PatientAccessScope = {
  organizationId: scopeA.organizationId,
  psychologistId: 'psychologist-b-id',
};
const scopeSamePsychologistOtherOrganization: PatientAccessScope = {
  organizationId: 'organization-b-id',
  psychologistId: scopeA.psychologistId,
};

describe('PatientsService tenant-aware ownership', () => {
  let service: PatientsService;
  let prisma: PrismaMock;
  let documentsService: Pick<DocumentsService, 'cleanupDocumentFiles'>;

  beforeEach(() => {
    prisma = {
      patient: {
        create: jest.fn(),
        deleteMany: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      document: { findMany: jest.fn() },
    };
    documentsService = { cleanupDocumentFiles: jest.fn() };
    service = new PatientsService(
      prisma as unknown as PrismaService,
      documentsService as DocumentsService,
    );
  });

  it('lists only patients matching both tenant and legacy ownership', async () => {
    prisma.patient.findMany.mockResolvedValue([]);

    await service.findAll(scopeA);

    expect(prisma.patient.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: scopeA.organizationId,
        psychologistId: scopeA.psychologistId,
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it.each([
    ['a missing patient', scopeA],
    ['a patient from another psychologist in the same organization', scopeA],
    ['a patient from another organization for the same psychologist', scopeA],
    ['a legacy patient with a null organizationId', scopeA],
  ])('returns the same 404 for %s', async (_, scope) => {
    prisma.patient.findFirst.mockResolvedValue(null);

    await expect(service.findOne('patient-id', scope)).rejects.toEqual(
      new NotFoundException('Patient with id "patient-id" not found'),
    );
    expect(prisma.patient.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'patient-id',
        organizationId: scope.organizationId,
        psychologistId: scope.psychologistId,
      },
    });
  });

  it('keeps same-organization and same-psychologist scope variants distinct', async () => {
    prisma.patient.findMany.mockResolvedValue([]);

    await service.findAll(scopeSameOrganizationOtherPsychologist);
    await service.findAll(scopeSamePsychologistOtherOrganization);

    expect(prisma.patient.findMany).toHaveBeenNthCalledWith(1, {
      where: scopeSameOrganizationOtherPsychologist,
      orderBy: { createdAt: 'desc' },
    });
    expect(prisma.patient.findMany).toHaveBeenNthCalledWith(2, {
      where: scopeSamePsychologistOtherOrganization,
      orderBy: { createdAt: 'desc' },
    });
  });

  it('forces scope ownership on create even when an unsafe caller supplies IDs', async () => {
    prisma.patient.create.mockResolvedValue({ id: 'patient-a-id' });
    const unsafeDto = {
      firstName: 'A',
      lastName: 'Patient',
      organizationId: 'organization-b-id',
      psychologistId: 'psychologist-b-id',
    };

    await service.create(unsafeDto, scopeA);

    expect(prisma.patient.create).toHaveBeenCalledWith({
      data: {
        firstName: 'A',
        lastName: 'Patient',
        organizationId: scopeA.organizationId,
        psychologistId: scopeA.psychologistId,
      },
    });
  });

  it('updates only a fully scoped patient and never forwards unsafe ownership fields', async () => {
    prisma.patient.updateMany.mockResolvedValue({ count: 1 });
    prisma.patient.findFirst.mockResolvedValue({ id: 'patient-a-id' });
    const unsafeDto = {
      firstName: 'Updated',
      organizationId: 'organization-b-id',
      psychologistId: 'psychologist-b-id',
    };

    await service.update('patient-a-id', unsafeDto, scopeA);

    expect(prisma.patient.updateMany).toHaveBeenCalledWith({
      where: { id: 'patient-a-id', ...scopeA },
      data: { firstName: 'Updated' },
    });
    expect(prisma.patient.findFirst).toHaveBeenCalledWith({
      where: { id: 'patient-a-id', ...scopeA },
    });
  });

  it('returns 404 and does not reread when scoped update affects no patient', async () => {
    prisma.patient.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update('patient-id', { firstName: 'Updated' }, scopeA),
    ).rejects.toEqual(
      new NotFoundException('Patient with id "patient-id" not found'),
    );
    expect(prisma.patient.updateMany).toHaveBeenCalledWith({
      where: { id: 'patient-id', ...scopeA },
      data: { firstName: 'Updated' },
    });
    expect(prisma.patient.findFirst).not.toHaveBeenCalled();
  });

  it('checks the scoped patient before loading document metadata and cleans files only after delete', async () => {
    prisma.patient.findFirst.mockResolvedValue({ id: 'patient-a-id' });
    prisma.document.findMany.mockResolvedValue([
      { filePath: 'uploads/patients/patient-a-id/one.pdf' },
    ]);
    prisma.patient.deleteMany.mockResolvedValue({ count: 1 });

    await service.remove('patient-a-id', scopeA);

    expect(prisma.patient.findFirst).toHaveBeenCalledWith({
      where: { id: 'patient-a-id', ...scopeA },
    });
    expect(prisma.document.findMany).toHaveBeenCalledWith({
      where: {
        caseFile: { patient: { id: 'patient-a-id', ...scopeA } },
      },
      select: { filePath: true },
    });
    expect(prisma.patient.deleteMany).toHaveBeenCalledWith({
      where: { id: 'patient-a-id', ...scopeA },
    });
    expect(documentsService.cleanupDocumentFiles).toHaveBeenCalledWith([
      'uploads/patients/patient-a-id/one.pdf',
    ]);
  });

  it('returns the same 404 without cleanup when scoped delete affects no patient', async () => {
    prisma.patient.findFirst.mockResolvedValue({ id: 'patient-id' });
    prisma.document.findMany.mockResolvedValue([]);
    prisma.patient.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.remove('patient-id', scopeA)).rejects.toEqual(
      new NotFoundException('Patient with id "patient-id" not found'),
    );
    expect(prisma.patient.deleteMany).toHaveBeenCalledWith({
      where: { id: 'patient-id', ...scopeA },
    });
    expect(documentsService.cleanupDocumentFiles).not.toHaveBeenCalled();
  });
});
