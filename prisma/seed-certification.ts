import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  FinancialTransactionType,
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  PatientAssignmentStatus,
  PrismaClient,
} from '@prisma/client';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not defined.');
}

if (process.env.NODE_ENV === 'production') {
  throw new Error('Seed certification must not run with NODE_ENV=production.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(connectionString),
});

function seedUuid(namespace: number, value: number) {
  return `${namespace.toString().padStart(8, '0')}-0000-4000-8000-${value
    .toString()
    .padStart(12, '0')}`;
}

const ids = {
  orgA: seedUuid(22000000, 1),
  orgB: seedUuid(22000000, 2),
  orgSuspended: seedUuid(22000000, 3),
};

const expected = {
  organizations: 3,
  users: 14,
  memberships: 14,
  patients: 6,
  caseFiles: 6,
  sessionNotes: 3,
  documents: 3,
  appointments: 4,
  financialTransactions: 7,
  tenantASummary: {
    incomeTotal: 2000,
    expenseTotal: 300,
    adjustmentTotal: 50,
    refundTotal: 100,
    netTotal: 1650,
    transactionCount: 5,
  },
};

const seedEmails = [
  'owner.a@example.test',
  'admin.a@example.test',
  'psychologist.assigned.a@example.test',
  'psychologist.unassigned.a@example.test',
  'receptionist.a@example.test',
  'billing.a@example.test',
  'auditor.a@example.test',
  'readonly.a@example.test',
  'owner.b@example.test',
  'psychologist.b@example.test',
  'multi.member@example.test',
  'suspended.membership.a@example.test',
  'suspended.organization@example.test',
  'no.membership@example.test',
];

const preferenceFixtureEmails = {
  noPreference: 'no.membership@example.test',
  validPreference: 'multi.member@example.test',
  stalePreference: 'suspended.organization@example.test',
};

const organizationIds = [ids.orgA, ids.orgB, ids.orgSuspended];

async function main() {
  const [
    organizations,
    users,
    memberships,
    patients,
    caseFiles,
    sessionNotes,
    documents,
    appointments,
    financialTransactions,
    roleCounts,
    suspendedMemberships,
    suspendedOrganizations,
    activeAssignments,
    legacyNullRows,
    tenantASummary,
    tenantBSummary,
    preferenceFixtures,
  ] = await Promise.all([
    prisma.organization.count({ where: { id: { in: organizationIds } } }),
    prisma.user.count({ where: { email: { in: seedEmails } } }),
    prisma.organizationMembership.count({
      where: { organizationId: { in: organizationIds } },
    }),
    prisma.patient.count({
      where: { organizationId: { in: organizationIds } },
    }),
    prisma.caseFile.count({
      where: { organizationId: { in: organizationIds } },
    }),
    prisma.sessionNote.count({
      where: { organizationId: { in: organizationIds } },
    }),
    prisma.document.count({
      where: { organizationId: { in: organizationIds } },
    }),
    prisma.appointment.count({
      where: { organizationId: { in: organizationIds } },
    }),
    prisma.financialTransaction.count({
      where: { organizationId: { in: organizationIds } },
    }),
    prisma.organizationMembership.groupBy({
      by: ['role'],
      where: { organizationId: { in: organizationIds } },
      _count: { _all: true },
    }),
    prisma.organizationMembership.count({
      where: {
        organizationId: ids.orgA,
        status: MembershipStatus.SUSPENDED,
      },
    }),
    prisma.organization.count({
      where: {
        id: ids.orgSuspended,
        status: OrganizationStatus.SUSPENDED,
      },
    }),
    prisma.patientAssignment.count({
      where: {
        organizationId: { in: [ids.orgA, ids.orgB] },
        status: PatientAssignmentStatus.ACTIVE,
      },
    }),
    countLegacyNullRows(),
    summarize(ids.orgA),
    summarize(ids.orgB),
    prisma.user.findMany({
      where: {
        email: {
          in: Object.values(preferenceFixtureEmails),
        },
      },
      select: {
        email: true,
        preferredOrganizationId: true,
        memberships: {
          select: {
            organizationId: true,
            status: true,
            organization: {
              select: {
                status: true,
              },
            },
          },
        },
      },
      orderBy: { email: 'asc' },
    }),
  ]);

  assertEqual('Organizations', organizations, expected.organizations);
  assertEqual('Users', users, expected.users);
  assertEqual('Memberships', memberships, expected.memberships);
  assertEqual('Patients', patients, expected.patients);
  assertEqual('Case Files', caseFiles, expected.caseFiles);
  assertEqual('Session Notes', sessionNotes, expected.sessionNotes);
  assertEqual('Documents', documents, expected.documents);
  assertEqual('Appointments', appointments, expected.appointments);
  assertEqual(
    'Financial Transactions',
    financialTransactions,
    expected.financialTransactions,
  );
  assertEqual('Suspended memberships', suspendedMemberships, 1);
  assertEqual('Suspended organizations', suspendedOrganizations, 1);
  assertEqual('Active assignments', activeAssignments, 5);
  assertEqual('Legacy-null rows created by seed', legacyNullRows, 0);
  assertObject(
    'Tenant A expected summary',
    tenantASummary,
    expected.tenantASummary,
  );
  assertEqual('Tenant B transaction count', tenantBSummary.transactionCount, 2);

  const roles = Object.fromEntries(
    roleCounts.map((entry) => [entry.role, entry._count._all]),
  );
  assertObject('Membership roles', roles, {
    [MembershipRole.OWNER]: 2,
    [MembershipRole.ADMIN]: 1,
    [MembershipRole.PSYCHOLOGIST]: 7,
    [MembershipRole.RECEPTIONIST]: 1,
    [MembershipRole.BILLING]: 1,
    [MembershipRole.AUDITOR]: 1,
    [MembershipRole.READ_ONLY]: 1,
  });

  assertEqual(
    'Cross-tenant relation violations',
    await countCrossTenantRelationViolations(),
    0,
  );
  assertPreferenceFixtures(preferenceFixtures);

  console.log('Tenant development seed certification passed.');
  console.log(
    JSON.stringify(
      {
        organizations,
        users,
        memberships,
        patients,
        caseFiles,
        sessionNotes,
        documents,
        appointments,
        financialTransactions,
        tenantASummary,
        tenantBTransactionCount: tenantBSummary.transactionCount,
      },
      null,
      2,
    ),
  );
}

function assertPreferenceFixtures(
  fixtures: Array<{
    email: string;
    preferredOrganizationId: string | null;
    memberships: Array<{
      organizationId: string;
      status: MembershipStatus;
      organization: { status: OrganizationStatus };
    }>;
  }>,
) {
  const byEmail = new Map(fixtures.map((fixture) => [fixture.email, fixture]));

  const noPreference = byEmail.get(preferenceFixtureEmails.noPreference);
  if (!noPreference) {
    throw new Error('Missing no-preference fixture user');
  }
  if (noPreference.preferredOrganizationId !== null) {
    throw new Error('No-preference fixture must persist null');
  }

  const validPreference = byEmail.get(preferenceFixtureEmails.validPreference);
  if (!validPreference) {
    throw new Error('Missing valid-preference fixture user');
  }
  if (validPreference.preferredOrganizationId !== ids.orgB) {
    throw new Error(
      `Valid-preference fixture must persist ${ids.orgB}, received ${validPreference.preferredOrganizationId}`,
    );
  }
  const validMembership = validPreference.memberships.find(
    (membership) => membership.organizationId === ids.orgB,
  );
  if (!validMembership) {
    throw new Error('Valid-preference fixture must keep a membership in orgB');
  }
  if (validMembership.status !== MembershipStatus.ACTIVE) {
    throw new Error('Valid-preference fixture membership must be ACTIVE');
  }
  if (validMembership.organization.status !== OrganizationStatus.ACTIVE) {
    throw new Error('Valid-preference fixture organization must be ACTIVE');
  }

  const stalePreference = byEmail.get(preferenceFixtureEmails.stalePreference);
  if (!stalePreference) {
    throw new Error('Missing stale-preference fixture user');
  }
  if (stalePreference.preferredOrganizationId !== ids.orgSuspended) {
    throw new Error(
      `Stale-preference fixture must persist ${ids.orgSuspended}, received ${stalePreference.preferredOrganizationId}`,
    );
  }
}

async function countLegacyNullRows() {
  const [
    patients,
    caseFiles,
    sessionNotes,
    documents,
    appointments,
    financialTransactions,
  ] = await Promise.all([
    prisma.patient.count({
      where: {
        email: {
          in: [
            'patient.owner.a@example.test',
            'patient.assigned.a@example.test',
            'patient.unassigned.a@example.test',
            'patient.b@example.test',
            'patient.multi.a@example.test',
            'patient.multi.b@example.test',
          ],
        },
        organizationId: null,
      },
    }),
    prisma.caseFile.count({
      where: {
        id: {
          in: [1, 2, 3, 4, 5, 6].map((value) => seedUuid(26000000, value)),
        },
        organizationId: null,
      },
    }),
    prisma.sessionNote.count({
      where: {
        id: {
          in: [1, 2, 3].map((value) => seedUuid(27000000, value)),
        },
        organizationId: null,
      },
    }),
    prisma.document.count({
      where: {
        id: {
          in: [1, 2, 3].map((value) => seedUuid(28000000, value)),
        },
        organizationId: null,
      },
    }),
    prisma.appointment.count({
      where: {
        id: {
          in: [1, 2, 3, 4].map((value) => seedUuid(29000000, value)),
        },
        organizationId: null,
      },
    }),
    prisma.financialTransaction.count({
      where: {
        id: {
          in: [1, 2, 3, 4, 5, 6, 7].map((value) => seedUuid(30000000, value)),
        },
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
    financialTransactions
  );
}

async function summarize(organizationId: string) {
  const rows = await prisma.financialTransaction.groupBy({
    by: ['type'],
    where: { organizationId },
    _sum: { amount: true },
    _count: { _all: true },
  });

  const summary = {
    incomeTotal: 0,
    expenseTotal: 0,
    adjustmentTotal: 0,
    refundTotal: 0,
    netTotal: 0,
    transactionCount: 0,
  };

  for (const row of rows) {
    const amount = Number(row._sum.amount ?? 0);
    summary.transactionCount += row._count._all;

    if (row.type === FinancialTransactionType.INCOME) {
      summary.incomeTotal += amount;
    }
    if (row.type === FinancialTransactionType.EXPENSE) {
      summary.expenseTotal += amount;
    }
    if (row.type === FinancialTransactionType.ADJUSTMENT) {
      summary.adjustmentTotal += amount;
    }
    if (row.type === FinancialTransactionType.REFUND) {
      summary.refundTotal += amount;
    }
  }

  summary.netTotal =
    summary.incomeTotal +
    summary.adjustmentTotal -
    summary.expenseTotal -
    summary.refundTotal;

  return summary;
}

async function countCrossTenantRelationViolations() {
  const [caseFiles, sessionNotes, documents, appointments, transactions] =
    await Promise.all([
      prisma.caseFile.findMany({
        where: {
          organizationId: { in: organizationIds },
        },
        select: {
          organizationId: true,
          patient: { select: { organizationId: true } },
        },
      }),
      prisma.sessionNote.findMany({
        where: {
          organizationId: { in: organizationIds },
        },
        select: {
          organizationId: true,
          caseFile: { select: { organizationId: true } },
        },
      }),
      prisma.document.findMany({
        where: {
          organizationId: { in: organizationIds },
        },
        select: {
          organizationId: true,
          caseFile: { select: { organizationId: true } },
        },
      }),
      prisma.appointment.findMany({
        where: {
          organizationId: { in: organizationIds },
        },
        select: {
          organizationId: true,
          patient: { select: { organizationId: true } },
        },
      }),
      prisma.financialTransaction.findMany({
        where: {
          organizationId: { in: organizationIds },
        },
        select: {
          organizationId: true,
          patient: { select: { organizationId: true } },
          appointment: { select: { organizationId: true } },
        },
      }),
    ]);

  return (
    caseFiles.filter(
      (caseFile) => caseFile.organizationId !== caseFile.patient.organizationId,
    ).length +
    sessionNotes.filter(
      (note) => note.organizationId !== note.caseFile.organizationId,
    ).length +
    documents.filter(
      (document) =>
        document.organizationId !== document.caseFile.organizationId,
    ).length +
    appointments.filter(
      (appointment) =>
        appointment.organizationId !== appointment.patient.organizationId,
    ).length +
    transactions.filter(
      (transaction) =>
        (transaction.patient &&
          transaction.organizationId !== transaction.patient.organizationId) ||
        (transaction.appointment &&
          transaction.organizationId !==
            transaction.appointment.organizationId),
    ).length
  );
}

function assertEqual(label: string, actual: number, expectedValue: number) {
  if (actual !== expectedValue) {
    throw new Error(`${label}: expected ${expectedValue}, received ${actual}`);
  }
}

function assertObject(
  label: string,
  actual: Record<string, number>,
  expectedValue: Record<string, number>,
) {
  for (const [key, value] of Object.entries(expectedValue)) {
    assertEqual(`${label}.${key}`, actual[key] ?? 0, value);
  }
}

main()
  .catch((error) => {
    console.error('Seed certification failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
