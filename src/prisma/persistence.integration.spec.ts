import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { parseLegacyBackfillManifest } from './legacy-backfill/manifest';
import { createLegacyBackfillPlan } from './legacy-backfill/legacy-backfill.service';

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

  it('keeps the tenant-aware seed idempotent', async () => {
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
      patients: 6,
      caseFiles: 6,
      sessionNotes: 3,
      documents: 3,
      appointments: 4,
      transactions: 7,
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
      7,
    );
    expect(groups.every((group) => group._sum.amount !== null)).toBe(true);
  });

  it('persists the additive SaaS foundation without changing legacy ownership', async () => {
    const suffix = randomUUID();
    const organizationAId = randomUUID();
    const organizationBId = randomUUID();
    const standaloneOrganizationId = randomUUID();
    const memberUserId = randomUUID();
    const profileOnlyUserId = randomUUID();

    try {
      await prisma.user.create({
        data: {
          id: memberUserId,
          name: 'SaaS Membership Test User',
          email: `saas-member-${suffix}@example.test`,
          passwordHash: 'not-a-real-password',
          role: 'PSYCHOLOGIST',
        },
      });
      await prisma.user.create({
        data: {
          id: profileOnlyUserId,
          name: 'SaaS Profile Test User',
          email: `saas-profile-${suffix}@example.test`,
          passwordHash: 'not-a-real-password',
          role: 'PSYCHOLOGIST',
        },
      });

      await prisma.organization.createMany({
        data: [
          {
            id: organizationAId,
            slug: `saas-a-${suffix}`,
            legalName: 'SaaS Organization A',
            displayName: 'SaaS A',
            status: 'ACTIVE',
          },
          {
            id: organizationBId,
            slug: `saas-b-${suffix}`,
            legalName: 'SaaS Organization B',
            displayName: 'SaaS B',
            status: 'ACTIVE',
          },
        ],
      });

      await prisma.organizationMembership.createMany({
        data: [
          {
            organizationId: organizationAId,
            userId: memberUserId,
            role: 'PSYCHOLOGIST',
            status: 'ACTIVE',
            joinedAt: new Date(),
          },
          {
            organizationId: organizationBId,
            userId: memberUserId,
            role: 'PSYCHOLOGIST',
            status: 'ACTIVE',
            joinedAt: new Date(),
          },
        ],
      });

      await expect(
        prisma.organizationMembership.create({
          data: {
            organizationId: organizationAId,
            userId: memberUserId,
            role: 'PSYCHOLOGIST',
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });

      await prisma.psychologistProfile.create({
        data: {
          userId: profileOnlyUserId,
          professionalName: 'Profile Without Membership',
        },
      });
      expect(
        await prisma.organizationMembership.count({
          where: { userId: profileOnlyUserId },
        }),
      ).toBe(0);

      await prisma.organization.create({
        data: {
          id: standaloneOrganizationId,
          slug: `saas-standalone-${suffix}`,
          legalName: 'Standalone Organization',
          displayName: 'Standalone',
          settings: { create: {} },
          branding: { create: { visualName: 'Standalone' } },
        },
      });
      await prisma.organization.delete({
        where: { id: standaloneOrganizationId },
      });
      expect(
        await prisma.organizationSettings.findUnique({
          where: { organizationId: standaloneOrganizationId },
        }),
      ).toBeNull();

      expect(
        await prisma.patient.count({ where: { organizationId: null } }),
      ).toBe(0);
    } finally {
      await prisma.organizationMembership.deleteMany({
        where: { userId: memberUserId },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: [organizationAId, organizationBId] } },
      });
      await prisma.psychologistProfile.deleteMany({
        where: { userId: profileOnlyUserId },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [memberUserId, profileOnlyUserId] } },
      });
    }
  });

  it('does not treat the tenant-aware seed as a legacy backfill target', async () => {
    const owner = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true, role: true },
    });

    expect(owner).not.toBeNull();

    const manifest = parseLegacyBackfillManifest({
      version: 1,
      organization: {
        slug: 'legacy-integration-test',
        legalName: 'Legacy Integration Test Practice',
        displayName: 'Legacy Integration Test',
        status: 'ACTIVE',
      },
      owner: { userId: owner!.id },
    });

    const dryRunPlan = await createLegacyBackfillPlan(prisma, manifest);

    expect(dryRunPlan.blockers.map((blocker) => blocker.code)).toEqual(
      expect.arrayContaining([
        'MULTIPLE_ORGANIZATIONS',
        'ORGANIZATION_MANIFEST_CONFLICT',
      ]),
    );
    expect(dryRunPlan.updates).toEqual({
      patients: [],
      caseFiles: [],
      sessionNotes: [],
      documents: [],
      appointments: [],
      financialTransactions: [],
    });
    expect(
      await prisma.patient.count({ where: { organizationId: null } }),
    ).toBe(0);
  });
});
