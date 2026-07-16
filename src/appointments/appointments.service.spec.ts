import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { AppointmentsService } from './appointments.service';

type PrismaMock = {
  appointment: {
    create: jest.Mock;
    delete: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  patient: { findFirst: jest.Mock; findUnique: jest.Mock };
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

describe('AppointmentsService ownership', () => {
  let service: AppointmentsService;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = {
      appointment: {
        create: jest.fn(),
        delete: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      patient: { findFirst: jest.fn(), findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
    };
    service = new AppointmentsService(prisma as unknown as PrismaService);
  });

  const createDto = {
    patientId: 'patient-a-id',
    psychologistId: 'psychologist-b-id',
    scheduledAt: new Date(),
    durationMinutes: 50,
  };

  it('rejects creation for patient B before creating an appointment', async () => {
    prisma.patient.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        { ...createDto, patientId: 'patient-b-id' },
        psychologistA,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });

  it('forces psychologist A on create and blocks reassignment to patient B or psychologist B', async () => {
    prisma.patient.findFirst.mockResolvedValue({ id: 'patient-a-id' });
    prisma.user.findUnique.mockResolvedValue({ id: psychologistA.id });
    prisma.appointment.create.mockResolvedValue({ id: 'appointment-a-id' });
    await service.create(createDto, psychologistA);

    expect(prisma.appointment.create).toHaveBeenCalledTimes(1);
    const appointmentCreateCalls = prisma.appointment.create.mock
      .calls as unknown as [[{ data: { psychologistId: string } }]];
    expect(appointmentCreateCalls[0][0].data.psychologistId).toBe(
      psychologistA.id,
    );

    prisma.appointment.findFirst.mockResolvedValue({ id: 'appointment-a-id' });
    prisma.patient.findFirst.mockResolvedValue(null);
    await expect(
      service.update(
        'appointment-a-id',
        { patientId: 'patient-b-id', psychologistId: 'psychologist-b-id' },
        psychologistA,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.appointment.update).not.toHaveBeenCalled();
  });

  it('lists only appointments A and rejects read, update, and delete of appointment B', async () => {
    prisma.appointment.findMany.mockResolvedValue([]);
    await service.findAll(psychologistA);
    expect(prisma.appointment.findMany).toHaveBeenCalledWith({
      where: { psychologistId: psychologistA.id },
      orderBy: { scheduledAt: 'desc' },
    });

    prisma.appointment.findFirst.mockResolvedValue(null);
    await expect(
      service.findOne('appointment-b-id', psychologistA),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.update('appointment-b-id', { notes: 'changed' }, psychologistA),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.remove('appointment-b-id', psychologistA),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.appointment.findFirst).toHaveBeenCalledWith({
      where: { id: 'appointment-b-id', psychologistId: psychologistA.id },
    });
    expect(prisma.appointment.update).not.toHaveBeenCalled();
    expect(prisma.appointment.delete).not.toHaveBeenCalled();
  });

  it('validates patient ownership before listing appointments by patient', async () => {
    prisma.patient.findFirst.mockResolvedValue(null);

    await expect(
      service.findByPatientId('patient-b-id', psychologistA),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.appointment.findMany).not.toHaveBeenCalled();
  });

  it('keeps admin global access', async () => {
    prisma.appointment.findMany.mockResolvedValue([]);
    prisma.appointment.findUnique.mockResolvedValue({ id: 'appointment-b-id' });

    await service.findAll(admin);
    await expect(service.findOne('appointment-b-id', admin)).resolves.toEqual({
      id: 'appointment-b-id',
    });

    expect(prisma.appointment.findMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: { scheduledAt: 'desc' },
    });
    expect(prisma.appointment.findUnique).toHaveBeenCalledWith({
      where: { id: 'appointment-b-id' },
    });
  });
});
