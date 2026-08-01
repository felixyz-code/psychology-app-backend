import { PrismaPg } from '@prisma/adapter-pg';
import {
  MembershipRole,
  OrganizationStatus,
  PrismaClient,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { normalizeEmailIdentity } from '../common/identity/email-identity.util';

import { parseLegacyBackfillManifest } from './legacy-backfill/manifest';
import { createLegacyBackfillPlan } from './legacy-backfill/legacy-backfill.service';

const runPersistenceTests =
  process.env.RUN_PERSISTENCE_TESTS === 'true' ? describe : describe.skip;

const seededOrganizationIds = [
  seedUuid(22000000, 1),
  seedUuid(22000000, 2),
  seedUuid(22000000, 3),
];

const seededPatientEmails = [
  'patient.owner.a@example.test',
  'patient.assigned.a@example.test',
  'patient.unassigned.a@example.test',
  'patient.b@example.test',
  'patient.multi.a@example.test',
  'patient.multi.b@example.test',
];

const seededUpdateIds = {
  patients: [1, 2, 3, 4, 5, 6].map((value) => seedUuid(25000000, value)),
  caseFiles: [1, 2, 3, 4, 5, 6].map((value) => seedUuid(26000000, value)),
  sessionNotes: [1, 2, 3].map((value) => seedUuid(27000000, value)),
  documents: [1, 2, 3].map((value) => seedUuid(28000000, value)),
  appointments: [1, 2, 3, 4].map((value) => seedUuid(29000000, value)),
  financialTransactions: [1, 2, 3, 4, 5, 6, 7].map((value) =>
    seedUuid(30000000, value),
  ),
};

runPersistenceTests('PostgreSQL persistence integration', () => {
  let prisma: PrismaClient;
  let databaseUrl: string;

  beforeAll(async () => {
    databaseUrl = process.env.DATABASE_URL ?? '';
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
      prisma.patient.count({
        where: { organizationId: { in: seededOrganizationIds } },
      }),
      prisma.caseFile.count({
        where: { organizationId: { in: seededOrganizationIds } },
      }),
      prisma.sessionNote.count({
        where: { organizationId: { in: seededOrganizationIds } },
      }),
      prisma.document.count({
        where: { organizationId: { in: seededOrganizationIds } },
      }),
      prisma.appointment.count({
        where: { organizationId: { in: seededOrganizationIds } },
      }),
      prisma.financialTransaction.count({
        where: { organizationId: { in: seededOrganizationIds } },
      }),
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

  it('enforces canonical user email uniqueness across presentation variants', async () => {
    const suffix = randomUUID();
    const firstUserId = randomUUID();
    const secondUserId = randomUUID();
    const firstEmail = `Canonical-${suffix}@example.test`;
    const normalizedEmail = normalizeEmailIdentity(
      `  CANONICAL-${suffix}@EXAMPLE.TEST  `,
    );

    try {
      await prisma.user.create({
        data: {
          id: firstUserId,
          name: 'Canonical Email User A',
          email: firstEmail,
          normalizedEmail,
          passwordHash: 'not-a-real-password',
          role: 'PSYCHOLOGIST',
        },
      });

      await expect(
        prisma.user.create({
          data: {
            id: secondUserId,
            name: 'Canonical Email User B',
            email: `  CANONICAL-${suffix}@EXAMPLE.TEST  `,
            normalizedEmail,
            passwordHash: 'not-a-real-password',
            role: 'PSYCHOLOGIST',
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    } finally {
      await prisma.user.deleteMany({
        where: { id: { in: [firstUserId, secondUserId] } },
      });
    }
  });

  it('groups financial totals in PostgreSQL', async () => {
    const groups = await prisma.financialTransaction.groupBy({
      by: ['type'],
      where: { organizationId: { in: seededOrganizationIds } },
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
          normalizedEmail: normalizeEmailIdentity(
            `saas-member-${suffix}@example.test`,
          ),
          passwordHash: 'not-a-real-password',
          role: 'PSYCHOLOGIST',
        },
      });
      await prisma.user.create({
        data: {
          id: profileOnlyUserId,
          name: 'SaaS Profile Test User',
          email: `saas-profile-${suffix}@example.test`,
          normalizedEmail: normalizeEmailIdentity(
            `saas-profile-${suffix}@example.test`,
          ),
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

      expect(await countSeedLegacyNullRows(prisma)).toBe(0);
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

  it('permits historical revoked memberships while rejecting concurrent non-terminal duplicates', async () => {
    const suffix = randomUUID();
    const organizationId = randomUUID();
    const userId = randomUUID();
    const firstMembershipId = randomUUID();
    const secondMembershipId = randomUUID();
    const thirdMembershipId = randomUUID();

    try {
      await prisma.user.create({
        data: {
          id: userId,
          name: 'Historical Reentry User',
          email: `historical-reentry-${suffix}@example.test`,
          normalizedEmail: normalizeEmailIdentity(
            `historical-reentry-${suffix}@example.test`,
          ),
          passwordHash: 'not-a-real-password',
          role: 'PSYCHOLOGIST',
        },
      });
      await prisma.organization.create({
        data: {
          id: organizationId,
          slug: `historical-reentry-${suffix}`,
          legalName: 'Historical Reentry Org',
          displayName: 'Historical Reentry',
          status: 'ACTIVE',
        },
      });

      await prisma.organizationMembership.create({
        data: {
          id: firstMembershipId,
          organizationId,
          userId,
          role: 'PSYCHOLOGIST',
          status: 'REVOKED',
          joinedAt: new Date('2026-01-01T00:00:00.000Z'),
          revokedAt: new Date('2026-02-01T00:00:00.000Z'),
        },
      });

      await prisma.organizationMembership.create({
        data: {
          id: secondMembershipId,
          organizationId,
          userId,
          role: 'PSYCHOLOGIST',
          status: 'ACTIVE',
          joinedAt: new Date('2026-03-01T00:00:00.000Z'),
        },
      });

      await expect(
        prisma.organizationMembership.create({
          data: {
            id: randomUUID(),
            organizationId,
            userId,
            role: 'PSYCHOLOGIST',
            status: 'SUSPENDED',
            suspendedAt: new Date('2026-04-01T00:00:00.000Z'),
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });

      await prisma.organizationMembership.update({
        where: { id: secondMembershipId },
        data: {
          status: 'REVOKED',
          revokedAt: new Date('2026-05-01T00:00:00.000Z'),
        },
      });

      await prisma.organizationMembership.create({
        data: {
          id: thirdMembershipId,
          organizationId,
          userId,
          role: 'PSYCHOLOGIST',
          status: 'ACTIVE',
          joinedAt: new Date('2026-06-01T00:00:00.000Z'),
        },
      });

      const memberships = await prisma.organizationMembership.findMany({
        where: { organizationId, userId },
        orderBy: { createdAt: 'asc' },
        select: { id: true, status: true, revokedAt: true },
      });

      expect(memberships).toHaveLength(3);
      expect(
        memberships.filter((membership) => membership.status === 'REVOKED'),
      ).toHaveLength(2);
      expect(
        memberships.filter((membership) => membership.status === 'ACTIVE'),
      ).toHaveLength(1);
      expect(memberships.at(-1)).toMatchObject({
        id: thirdMembershipId,
        status: 'ACTIVE',
      });
    } finally {
      await prisma.organizationMembership.deleteMany({
        where: { organizationId, userId },
      });
      await prisma.organization.deleteMany({ where: { id: organizationId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  });

  it('enforces one pending invitation per organization and preserves historical rows across replacement-like inserts', async () => {
    const suffix = randomUUID();
    const organizationAId = randomUUID();
    const organizationBId = randomUUID();
    const invitationA1Id = randomUUID();
    const invitationA2Id = randomUUID();
    const invitationB1Id = randomUUID();
    const email = `invitation-${suffix}@example.test`;
    const normalizedEmail = email.toLocaleLowerCase('en-US');
    const sharedDigest = tokenDigestSeed();

    try {
      await prisma.organization.createMany({
        data: [
          organizationRecord(organizationAId, `invitation-a-${suffix}`),
          organizationRecord(organizationBId, `invitation-b-${suffix}`),
        ],
      });

      await prisma.organizationInvitation.create({
        data: {
          id: invitationA1Id,
          organizationId: organizationAId,
          email,
          normalizedEmail,
          role: MembershipRole.PSYCHOLOGIST,
          tokenDigest: sharedDigest,
          expiresAt: new Date('2026-08-20T00:00:00.000Z'),
        },
      });

      await prisma.organizationInvitation.create({
        data: {
          id: invitationB1Id,
          organizationId: organizationBId,
          email,
          normalizedEmail,
          role: MembershipRole.PSYCHOLOGIST,
          tokenDigest: tokenDigestSeed(),
          expiresAt: new Date('2026-08-20T00:00:00.000Z'),
        },
      });

      await expect(
        prisma.organizationInvitation.create({
          data: {
            organizationId: organizationAId,
            email,
            normalizedEmail,
            role: MembershipRole.PSYCHOLOGIST,
            tokenDigest: tokenDigestSeed(),
            expiresAt: new Date('2026-08-21T00:00:00.000Z'),
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });

      await expect(
        prisma.organizationInvitation.create({
          data: {
            organizationId: organizationBId,
            email: `other-${suffix}@example.test`,
            normalizedEmail: `other-${suffix}@example.test`,
            role: MembershipRole.ADMIN,
            tokenDigest: sharedDigest,
            expiresAt: new Date('2026-08-21T00:00:00.000Z'),
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });

      await prisma.organizationInvitation.update({
        where: { id: invitationA1Id },
        data: { revokedAt: new Date('2026-08-10T00:00:00.000Z') },
      });

      await prisma.organizationInvitation.create({
        data: {
          id: invitationA2Id,
          organizationId: organizationAId,
          email,
          normalizedEmail,
          role: MembershipRole.PSYCHOLOGIST,
          tokenDigest: tokenDigestSeed(),
          expiresAt: new Date('2026-08-27T00:00:00.000Z'),
        },
      });

      const organizationAInvitations =
        await prisma.organizationInvitation.findMany({
          where: { organizationId: organizationAId, normalizedEmail },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            revokedAt: true,
            acceptedAt: true,
            rejectedAt: true,
            expiredAt: true,
          },
        });

      expect(organizationAInvitations).toHaveLength(2);
      expect(
        organizationAInvitations.map((invitation) => invitation.id),
      ).toEqual([invitationA1Id, invitationA2Id]);
      expect(
        organizationAInvitations.filter(
          (invitation) =>
            !invitation.acceptedAt &&
            !invitation.rejectedAt &&
            !invitation.revokedAt &&
            !invitation.expiredAt,
        ),
      ).toHaveLength(1);
      expect(organizationAInvitations[0]?.revokedAt).toBeInstanceOf(Date);
      expect(organizationAInvitations[1]?.revokedAt).toBeNull();
    } finally {
      await prisma.organizationInvitation.deleteMany({
        where: {
          organizationId: { in: [organizationAId, organizationBId] },
        },
      });
      await prisma.organization.deleteMany({
        where: { id: { in: [organizationAId, organizationBId] } },
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
    expectNoSeedUpdates(dryRunPlan.updates);
    expect(await countSeedLegacyNullRows(prisma)).toBe(0);
  });
});

function expectNoSeedUpdates(updates: {
  patients: string[];
  caseFiles: string[];
  sessionNotes: string[];
  documents: string[];
  appointments: string[];
  financialTransactions: string[];
}) {
  expect(updates.patients).toEqual(
    expect.not.arrayContaining(seededUpdateIds.patients),
  );
  expect(updates.caseFiles).toEqual(
    expect.not.arrayContaining(seededUpdateIds.caseFiles),
  );
  expect(updates.sessionNotes).toEqual(
    expect.not.arrayContaining(seededUpdateIds.sessionNotes),
  );
  expect(updates.documents).toEqual(
    expect.not.arrayContaining(seededUpdateIds.documents),
  );
  expect(updates.appointments).toEqual(
    expect.not.arrayContaining(seededUpdateIds.appointments),
  );
  expect(updates.financialTransactions).toEqual(
    expect.not.arrayContaining(seededUpdateIds.financialTransactions),
  );
}

async function countSeedLegacyNullRows(prisma: PrismaClient) {
  const [
    patients,
    caseFiles,
    sessionNotes,
    documents,
    appointments,
    transactions,
  ] = await Promise.all([
    prisma.patient.count({
      where: {
        email: { in: seededPatientEmails },
        organizationId: null,
      },
    }),
    prisma.caseFile.count({
      where: {
        id: { in: seededUpdateIds.caseFiles },
        organizationId: null,
      },
    }),
    prisma.sessionNote.count({
      where: {
        id: { in: seededUpdateIds.sessionNotes },
        organizationId: null,
      },
    }),
    prisma.document.count({
      where: {
        id: { in: seededUpdateIds.documents },
        organizationId: null,
      },
    }),
    prisma.appointment.count({
      where: {
        id: { in: seededUpdateIds.appointments },
        organizationId: null,
      },
    }),
    prisma.financialTransaction.count({
      where: {
        id: { in: seededUpdateIds.financialTransactions },
        organizationId: null,
      },
    }),
  ]);

  return (
    patients +
    caseFiles +
    sessionNotes +
    documents +
    appointments +
    transactions
  );
}

function organizationRecord(id: string, slug: string) {
  return {
    id,
    slug,
    legalName: 'Invitation Persistence Organization',
    displayName: 'Invitation Persistence',
    status: OrganizationStatus.ACTIVE,
  };
}

function tokenDigestSeed() {
  return randomUUID().replace(/-/g, '').repeat(2).slice(0, 64);
}

function seedUuid(namespace: number, value: number) {
  return `${namespace.toString().padStart(8, '0')}-0000-4000-8000-${value
    .toString()
    .padStart(12, '0')}`;
}
