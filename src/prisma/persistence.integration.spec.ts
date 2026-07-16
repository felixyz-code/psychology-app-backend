import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const runPersistenceTests =
  process.env.RUN_PERSISTENCE_TESTS === 'true' ? describe : describe.skip;

runPersistenceTests('PostgreSQL persistence integration', () => {
  let prisma: PrismaClient;
  const databaseUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required for persistence tests');
    }

    const databaseName = new URL(databaseUrl).pathname.slice(1);

    if (!databaseName.endsWith('_test')) {
      throw new Error('Persistence tests require a database ending in _test');
    }

    prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('keeps the seed idempotent and does not create document metadata', async () => {
    const [
      patients,
      caseFiles,
      sessionNotes,
      documents,
      appointments,
      transactions,
    ] = await Promise.all([
      prisma.patient.count(),
      prisma.caseFile.count(),
      prisma.sessionNote.count(),
      prisma.document.count(),
      prisma.appointment.count(),
      prisma.financialTransaction.count(),
    ]);

    expect({
      patients,
      caseFiles,
      sessionNotes,
      documents,
      appointments,
      transactions,
    }).toEqual({
      patients: 16,
      caseFiles: 14,
      sessionNotes: 30,
      documents: 0,
      appointments: 39,
      transactions: 35,
    });
  });

  it('enforces database constraints and exposes known Prisma error codes', async () => {
    const caseFile = await prisma.caseFile.findFirst({
      select: { patientId: true },
    });
    const user = await prisma.user.findFirst({ select: { id: true } });

    expect(caseFile).not.toBeNull();
    expect(user).not.toBeNull();

    await expect(
      prisma.caseFile.create({ data: { patientId: caseFile!.patientId } }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.document.create({
        data: {
          caseFileId: '70000000-0000-4000-8000-000000000001',
          uploadedById: user!.id,
          fileName: 'invalid.pdf',
          filePath: 'uploads/invalid.pdf',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      prisma.patient.update({
        where: { id: '70000000-0000-4000-8000-000000000002' },
        data: { firstName: 'Missing' },
      }),
    ).rejects.toMatchObject({ code: 'P2025' });
  });

  it('groups financial totals in PostgreSQL', async () => {
    const groups = await prisma.financialTransaction.groupBy({
      by: ['type'],
      _count: { _all: true },
      _sum: { amount: true },
    });

    expect(groups).toHaveLength(4);
    expect(groups.reduce((total, group) => total + group._count._all, 0)).toBe(
      35,
    );
    expect(groups.every((group) => group._sum.amount !== null)).toBe(true);
  });
});
