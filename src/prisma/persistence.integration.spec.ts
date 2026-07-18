import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { parseLegacyBackfillManifest } from './legacy-backfill/manifest';
import {
  applyLegacyBackfill,
  createLegacyBackfillPlan,
  hasChanges,
} from './legacy-backfill/legacy-backfill.service';

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
      ).toBe(16);
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

  it('backfills a legacy database only through the explicit manifest and remains idempotent', async () => {
    const owner = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true, role: true },
    });
    const psychologist = await prisma.user.findFirst({
      where: { role: 'PSYCHOLOGIST' },
      select: { id: true, role: true },
    });
    const additionalAdminId = randomUUID();

    expect(owner).not.toBeNull();
    expect(psychologist).not.toBeNull();

    const preexistingPsychologistProfile =
      await prisma.psychologistProfile.findUnique({
        where: { userId: psychologist!.id },
        select: { userId: true },
      });
    const profileCreatedForBackfillTest = !preexistingPsychologistProfile;
    if (profileCreatedForBackfillTest) {
      await prisma.psychologistProfile.create({
        data: {
          userId: psychologist!.id,
          professionalName: 'Existing Licensed Psychologist',
          licenseNumber: 'PERSIST-LICENSE',
          status: 'ACTIVE',
          verifiedAt: new Date(),
        },
      });
    }

    await prisma.user.create({
      data: {
        id: additionalAdminId,
        name: 'Legacy administrative user',
        email: `legacy-admin-${randomUUID()}@example.test`,
        passwordHash: 'not-a-real-password',
        role: 'ADMIN',
      },
    });

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

    try {
      const dryRunPlan = await createLegacyBackfillPlan(prisma, manifest);
      expect(dryRunPlan.blockers).toEqual([]);
      expect(await prisma.organization.count()).toBe(0);
      expect(
        await prisma.patient.count({ where: { organizationId: null } }),
      ).toBe(16);

      const applied = await applyLegacyBackfill(prisma, manifest);
      expect(applied.afterPlan.blockers).toEqual([]);
      expect(hasChanges(applied.afterPlan)).toBe(false);

      const organization = await prisma.organization.findUniqueOrThrow({
        where: { slug: manifest.organization.slug },
      });
      expect(await prisma.organization.count()).toBe(1);
      expect(
        await prisma.patient.count({
          where: { organizationId: organization.id },
        }),
      ).toBe(16);
      expect(
        await prisma.caseFile.count({
          where: { organizationId: organization.id },
        }),
      ).toBe(14);
      expect(
        await prisma.sessionNote.count({
          where: { organizationId: organization.id },
        }),
      ).toBe(30);
      expect(
        await prisma.document.count({
          where: { organizationId: organization.id },
        }),
      ).toBe(0);
      expect(
        await prisma.appointment.count({
          where: { organizationId: organization.id },
        }),
      ).toBe(39);
      expect(
        await prisma.financialTransaction.count({
          where: { organizationId: organization.id },
        }),
      ).toBe(35);
      expect(
        await prisma.patientAssignment.count({
          where: {
            organizationId: organization.id,
            role: 'PRIMARY',
            status: 'ACTIVE',
          },
        }),
      ).toBe(16);

      expect(
        await prisma.organizationMembership.findUniqueOrThrow({
          where: {
            organizationId_userId: {
              organizationId: organization.id,
              userId: owner!.id,
            },
          },
        }),
      ).toMatchObject({ role: 'OWNER', status: 'ACTIVE' });
      expect(
        await prisma.organizationMembership.findUniqueOrThrow({
          where: {
            organizationId_userId: {
              organizationId: organization.id,
              userId: additionalAdminId,
            },
          },
        }),
      ).toMatchObject({ role: 'ADMIN', status: 'ACTIVE' });
      expect(
        await prisma.psychologistProfile.findUniqueOrThrow({
          where: { userId: psychologist!.id },
        }),
      ).toMatchObject({
        status: 'ACTIVE',
        licenseNumber: 'PERSIST-LICENSE',
      });
      expect(
        await prisma.patient.count({
          where: { psychologistId: psychologist!.id },
        }),
      ).toBe(16);

      const secondRun = await applyLegacyBackfill(prisma, manifest);
      expect(hasChanges(secondRun.plan)).toBe(false);
      expect(await prisma.organization.count()).toBe(1);
      expect(
        await prisma.patientAssignment.count({
          where: {
            organizationId: organization.id,
            role: 'PRIMARY',
            status: 'ACTIVE',
          },
        }),
      ).toBe(16);
    } finally {
      const organization = await prisma.organization.findUnique({
        where: { slug: manifest.organization.slug },
        select: { id: true },
      });
      if (organization) {
        await prisma.patientAssignment.deleteMany({
          where: { organizationId: organization.id },
        });
        await prisma.patient.updateMany({
          where: { organizationId: organization.id },
          data: { organizationId: null },
        });
        await prisma.caseFile.updateMany({
          where: { organizationId: organization.id },
          data: { organizationId: null },
        });
        await prisma.sessionNote.updateMany({
          where: { organizationId: organization.id },
          data: { organizationId: null },
        });
        await prisma.document.updateMany({
          where: { organizationId: organization.id },
          data: { organizationId: null },
        });
        await prisma.appointment.updateMany({
          where: { organizationId: organization.id },
          data: { organizationId: null },
        });
        await prisma.financialTransaction.updateMany({
          where: { organizationId: organization.id },
          data: { organizationId: null },
        });
        await prisma.organizationMembership.deleteMany({
          where: { organizationId: organization.id },
        });
        await prisma.organization.delete({ where: { id: organization.id } });
      }
      if (profileCreatedForBackfillTest) {
        await prisma.psychologistProfile.deleteMany({
          where: { userId: psychologist!.id },
        });
      }
      await prisma.user.delete({ where: { id: additionalAdminId } });
    }
  });
});
