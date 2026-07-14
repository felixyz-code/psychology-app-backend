import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { PatientsService } from './patients.service';

type PrismaMock = {
  patient: {
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

describe('PatientsService ownership', () => {
  let service: PatientsService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = {
      patient: {
        create: jest.fn(),
        delete: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: { findUnique: jest.fn() },
    };
    service = new PatientsService(prisma as unknown as PrismaService);
  });

  it('lists only patients owned by psychologist A', async () => {
    prisma.patient.findMany.mockResolvedValue([]);

    await service.findAll(psychologistA);

    expect(prisma.patient.findMany).toHaveBeenCalledWith({
      where: { psychologistId: psychologistA.id },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('returns 404 for psychologist A reading, updating, or deleting patient B without mutating', async () => {
    prisma.patient.findFirst.mockResolvedValue(null);

    await expect(
      service.findOne('patient-b-id', psychologistA),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.update('patient-b-id', { firstName: 'Changed' }, psychologistA),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.remove('patient-b-id', psychologistA),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.patient.findFirst).toHaveBeenCalledWith({
      where: { id: 'patient-b-id', psychologistId: psychologistA.id },
    });
    expect(prisma.patient.update).not.toHaveBeenCalled();
    expect(prisma.patient.delete).not.toHaveBeenCalled();
  });

  it('forces psychologist A as owner on create and ignores a supplied owner reassignment', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: psychologistA.id });
    prisma.patient.create.mockResolvedValue({ id: 'patient-a-id' });
    prisma.patient.findFirst.mockResolvedValue({ id: 'patient-a-id' });
    prisma.patient.update.mockResolvedValue({ id: 'patient-a-id' });

    await service.create(
      {
        psychologistId: 'psychologist-b-id',
        firstName: 'A',
        lastName: 'Patient',
      },
      psychologistA,
    );
    await service.update(
      'patient-a-id',
      { psychologistId: 'psychologist-b-id' },
      psychologistA,
    );

    expect(prisma.patient.create).toHaveBeenCalledTimes(1);
    const patientCreateCalls = prisma.patient.create.mock.calls as unknown as [
      [{ data: { psychologistId: string } }],
    ];
    expect(patientCreateCalls[0][0].data.psychologistId).toBe(psychologistA.id);
    expect(prisma.patient.update).toHaveBeenCalledTimes(1);
    const patientUpdateCalls = prisma.patient.update.mock.calls as unknown as [
      [{ data: { psychologistId: string } }],
    ];
    expect(patientUpdateCalls[0][0].data.psychologistId).toBe(psychologistA.id);
  });

  it('keeps admin global access and permits the requested owner', async () => {
    prisma.patient.findMany.mockResolvedValue([]);
    prisma.patient.findUnique.mockResolvedValue({ id: 'patient-b-id' });
    prisma.user.findUnique.mockResolvedValue({ id: 'psychologist-b-id' });
    prisma.patient.create.mockResolvedValue({ id: 'patient-b-id' });

    await service.findAll(admin);
    await service.findOne('patient-b-id', admin);
    await service.create(
      {
        psychologistId: 'psychologist-b-id',
        firstName: 'B',
        lastName: 'Patient',
      },
      admin,
    );

    expect(prisma.patient.findMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: { createdAt: 'desc' },
    });
    expect(prisma.patient.findUnique).toHaveBeenCalledWith({
      where: { id: 'patient-b-id' },
    });
    expect(prisma.patient.create).toHaveBeenCalledTimes(1);
    const adminPatientCreateCalls = prisma.patient.create.mock
      .calls as unknown as [[{ data: { psychologistId: string } }]];
    expect(adminPatientCreateCalls[0][0].data.psychologistId).toBe(
      'psychologist-b-id',
    );
  });
});
