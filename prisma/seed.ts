import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { normalizeEmailIdentity } from '../src/common/identity/email-identity.util';
import { requireDemoSeedPassword } from './seed-demo-password';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  AppointmentStatus,
  FinancialTransactionCategory,
  FinancialTransactionStatus,
  FinancialTransactionType,
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  PatientAssignmentRole,
  PatientAssignmentStatus,
  PaymentMethod,
  Prisma,
  PrismaClient,
  PsychologistProfileStatus,
  UserRole,
} from '@prisma/client';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not defined.');
}

if (process.env.NODE_ENV === 'production') {
  throw new Error(
    'The development seed must not run with NODE_ENV=production.',
  );
}

const adapter = new PrismaPg(connectionString);
const prisma = new PrismaClient({ adapter });

const DEFAULT_LOCAL_PASSWORD = 'LocalSeedPassword123!';
const SEED_TAG = '[tenant-dev-seed]';

function seedUuid(namespace: number, value: number) {
  return `${namespace.toString().padStart(8, '0')}-0000-4000-8000-${value
    .toString()
    .padStart(12, '0')}`;
}

const ids = {
  orgA: seedUuid(22000000, 1),
  orgB: seedUuid(22000000, 2),
  orgSuspended: seedUuid(22000000, 3),
  ownerA: seedUuid(23000000, 1),
  adminA: seedUuid(23000000, 2),
  psychologistAssignedA: seedUuid(23000000, 3),
  psychologistUnassignedA: seedUuid(23000000, 4),
  receptionistA: seedUuid(23000000, 5),
  billingA: seedUuid(23000000, 6),
  auditorA: seedUuid(23000000, 7),
  readonlyA: seedUuid(23000000, 8),
  ownerB: seedUuid(23000000, 9),
  psychologistB: seedUuid(23000000, 10),
  multiMember: seedUuid(23000000, 11),
  suspendedMember: seedUuid(23000000, 12),
  suspendedOrgUser: seedUuid(23000000, 13),
  noMembership: seedUuid(23000000, 14),
  ownerMembershipA: seedUuid(24000000, 1),
  adminMembershipA: seedUuid(24000000, 2),
  psychologistAssignedMembershipA: seedUuid(24000000, 3),
  psychologistUnassignedMembershipA: seedUuid(24000000, 4),
  receptionistMembershipA: seedUuid(24000000, 5),
  billingMembershipA: seedUuid(24000000, 6),
  auditorMembershipA: seedUuid(24000000, 7),
  readonlyMembershipA: seedUuid(24000000, 8),
  ownerMembershipB: seedUuid(24000000, 9),
  psychologistMembershipB: seedUuid(24000000, 10),
  multiMembershipA: seedUuid(24000000, 11),
  multiMembershipB: seedUuid(24000000, 12),
  suspendedMembershipA: seedUuid(24000000, 13),
  suspendedOrgMembership: seedUuid(24000000, 14),
  ownerPatientA: seedUuid(25000000, 1),
  assignedPatientA: seedUuid(25000000, 2),
  unassignedPatientA: seedUuid(25000000, 3),
  patientB: seedUuid(25000000, 4),
  multiPatientA: seedUuid(25000000, 5),
  multiPatientB: seedUuid(25000000, 6),
  ownerCaseFileA: seedUuid(26000000, 1),
  assignedCaseFileA: seedUuid(26000000, 2),
  unassignedCaseFileA: seedUuid(26000000, 3),
  caseFileB: seedUuid(26000000, 4),
  multiCaseFileA: seedUuid(26000000, 5),
  multiCaseFileB: seedUuid(26000000, 6),
  ownerSessionNoteA: seedUuid(27000000, 1),
  assignedSessionNoteA: seedUuid(27000000, 2),
  sessionNoteB: seedUuid(27000000, 3),
  ownerDocumentA: seedUuid(28000000, 1),
  assignedDocumentA: seedUuid(28000000, 2),
  documentB: seedUuid(28000000, 3),
  ownerAppointmentA: seedUuid(29000000, 1),
  assignedAppointmentA: seedUuid(29000000, 2),
  appointmentWithoutNotesA: seedUuid(29000000, 3),
  appointmentB: seedUuid(29000000, 4),
  incomeA: seedUuid(30000000, 1),
  expenseA: seedUuid(30000000, 2),
  adjustmentA: seedUuid(30000000, 3),
  refundA: seedUuid(30000000, 4),
  pendingIncomeA: seedUuid(30000000, 5),
  incomeB: seedUuid(30000000, 6),
  expenseB: seedUuid(30000000, 7),
};

type SeedUser = {
  id: string;
  name: string;
  email: string;
  normalizedEmail: string;
  role: UserRole;
  preferredOrganizationId: string | null;
};

const organizations = [
  organization(ids.orgA, 'tenant-dev-a', 'Tenant Development A'),
  organization(ids.orgB, 'tenant-dev-b', 'Tenant Development B'),
  organization(
    ids.orgSuspended,
    'tenant-dev-suspended',
    'Tenant Development Suspended',
    OrganizationStatus.SUSPENDED,
  ),
] satisfies Prisma.OrganizationCreateManyInput[];

const users: SeedUser[] = [
  user(ids.ownerA, 'Owner A', 'owner.a@example.test'),
  user(ids.adminA, 'Admin A', 'admin.a@example.test', UserRole.ADMIN),
  user(
    ids.psychologistAssignedA,
    'Psychologist Assigned A',
    'psychologist.assigned.a@example.test',
  ),
  user(
    ids.psychologistUnassignedA,
    'Psychologist Unassigned A',
    'psychologist.unassigned.a@example.test',
  ),
  user(ids.receptionistA, 'Receptionist A', 'receptionist.a@example.test'),
  user(ids.billingA, 'Billing A', 'billing.a@example.test'),
  user(ids.auditorA, 'Auditor A', 'auditor.a@example.test'),
  user(ids.readonlyA, 'Read Only A', 'readonly.a@example.test'),
  user(ids.ownerB, 'Owner B', 'owner.b@example.test'),
  user(ids.psychologistB, 'Psychologist B', 'psychologist.b@example.test'),
  user(
    ids.multiMember,
    'Multi Member',
    'multi.member@example.test',
    UserRole.PSYCHOLOGIST,
    ids.orgB,
  ),
  user(
    ids.suspendedMember,
    'Suspended Membership A',
    'suspended.membership.a@example.test',
  ),
  user(
    ids.suspendedOrgUser,
    'Suspended Organization User',
    'suspended.organization@example.test',
    UserRole.PSYCHOLOGIST,
    ids.orgSuspended,
  ),
  user(ids.noMembership, 'No Membership User', 'no.membership@example.test'),
];

const memberships = [
  membership(ids.ownerMembershipA, ids.orgA, ids.ownerA, MembershipRole.OWNER),
  membership(ids.adminMembershipA, ids.orgA, ids.adminA, MembershipRole.ADMIN),
  membership(
    ids.psychologistAssignedMembershipA,
    ids.orgA,
    ids.psychologistAssignedA,
    MembershipRole.PSYCHOLOGIST,
  ),
  membership(
    ids.psychologistUnassignedMembershipA,
    ids.orgA,
    ids.psychologistUnassignedA,
    MembershipRole.PSYCHOLOGIST,
  ),
  membership(
    ids.receptionistMembershipA,
    ids.orgA,
    ids.receptionistA,
    MembershipRole.RECEPTIONIST,
  ),
  membership(
    ids.billingMembershipA,
    ids.orgA,
    ids.billingA,
    MembershipRole.BILLING,
  ),
  membership(
    ids.auditorMembershipA,
    ids.orgA,
    ids.auditorA,
    MembershipRole.AUDITOR,
  ),
  membership(
    ids.readonlyMembershipA,
    ids.orgA,
    ids.readonlyA,
    MembershipRole.READ_ONLY,
  ),
  membership(ids.ownerMembershipB, ids.orgB, ids.ownerB, MembershipRole.OWNER),
  membership(
    ids.psychologistMembershipB,
    ids.orgB,
    ids.psychologistB,
    MembershipRole.PSYCHOLOGIST,
  ),
  membership(
    ids.multiMembershipA,
    ids.orgA,
    ids.multiMember,
    MembershipRole.PSYCHOLOGIST,
  ),
  membership(
    ids.multiMembershipB,
    ids.orgB,
    ids.multiMember,
    MembershipRole.PSYCHOLOGIST,
  ),
  membership(
    ids.suspendedMembershipA,
    ids.orgA,
    ids.suspendedMember,
    MembershipRole.PSYCHOLOGIST,
    MembershipStatus.SUSPENDED,
  ),
  membership(
    ids.suspendedOrgMembership,
    ids.orgSuspended,
    ids.suspendedOrgUser,
    MembershipRole.PSYCHOLOGIST,
  ),
] satisfies Prisma.OrganizationMembershipCreateManyInput[];

const patients = [
  patient(
    ids.ownerPatientA,
    ids.orgA,
    ids.ownerA,
    'Olivia',
    'Owner',
    'patient.owner.a@example.test',
  ),
  patient(
    ids.assignedPatientA,
    ids.orgA,
    ids.psychologistAssignedA,
    'Paula',
    'Assigned',
    'patient.assigned.a@example.test',
  ),
  patient(
    ids.unassignedPatientA,
    ids.orgA,
    ids.psychologistAssignedA,
    'Uriel',
    'Unassigned',
    'patient.unassigned.a@example.test',
  ),
  patient(
    ids.patientB,
    ids.orgB,
    ids.psychologistB,
    'Bruno',
    'TenantB',
    'patient.b@example.test',
  ),
  patient(
    ids.multiPatientA,
    ids.orgA,
    ids.multiMember,
    'Mara',
    'Multi A',
    'patient.multi.a@example.test',
  ),
  patient(
    ids.multiPatientB,
    ids.orgB,
    ids.multiMember,
    'Mateo',
    'Multi B',
    'patient.multi.b@example.test',
  ),
] satisfies Prisma.PatientCreateManyInput[];

const assignments = [
  assignment(ids.orgA, ids.ownerPatientA, ids.ownerMembershipA),
  assignment(
    ids.orgA,
    ids.assignedPatientA,
    ids.psychologistAssignedMembershipA,
  ),
  assignment(ids.orgB, ids.patientB, ids.psychologistMembershipB),
  assignment(ids.orgA, ids.multiPatientA, ids.multiMembershipA),
  assignment(ids.orgB, ids.multiPatientB, ids.multiMembershipB),
] satisfies Prisma.PatientAssignmentCreateManyInput[];

const caseFiles = [
  caseFile(
    ids.ownerCaseFileA,
    ids.orgA,
    ids.ownerPatientA,
    'Seed owner diagnosis',
    'Seed owner treatment plan',
  ),
  caseFile(
    ids.assignedCaseFileA,
    ids.orgA,
    ids.assignedPatientA,
    'Seed assigned diagnosis',
    'Seed assigned treatment plan',
  ),
  caseFile(
    ids.unassignedCaseFileA,
    ids.orgA,
    ids.unassignedPatientA,
    'Seed unassigned diagnosis',
    'Seed unassigned treatment plan',
  ),
  caseFile(
    ids.caseFileB,
    ids.orgB,
    ids.patientB,
    'Seed tenant B diagnosis',
    'Seed tenant B treatment plan',
  ),
  caseFile(
    ids.multiCaseFileA,
    ids.orgA,
    ids.multiPatientA,
    'Seed multi A diagnosis',
    'Seed multi A plan',
  ),
  caseFile(
    ids.multiCaseFileB,
    ids.orgB,
    ids.multiPatientB,
    'Seed multi B diagnosis',
    'Seed multi B plan',
  ),
] satisfies Prisma.CaseFileCreateManyInput[];

const sessionNotes = [
  sessionNote(
    ids.ownerSessionNoteA,
    ids.orgA,
    ids.ownerCaseFileA,
    ids.ownerA,
    'Owner tenant session',
  ),
  sessionNote(
    ids.assignedSessionNoteA,
    ids.orgA,
    ids.assignedCaseFileA,
    ids.psychologistAssignedA,
    'Assigned psychologist session',
  ),
  sessionNote(
    ids.sessionNoteB,
    ids.orgB,
    ids.caseFileB,
    ids.psychologistB,
    'Tenant B session',
  ),
] satisfies Prisma.SessionNoteCreateManyInput[];

const documents = [
  document(
    ids.ownerDocumentA,
    ids.orgA,
    ids.ownerCaseFileA,
    ids.ownerA,
    ids.ownerPatientA,
    'seed-owner-a.pdf',
  ),
  document(
    ids.assignedDocumentA,
    ids.orgA,
    ids.assignedCaseFileA,
    ids.psychologistAssignedA,
    ids.assignedPatientA,
    'seed-assigned-a.pdf',
  ),
  document(
    ids.documentB,
    ids.orgB,
    ids.caseFileB,
    ids.psychologistB,
    ids.patientB,
    'seed-b.pdf',
  ),
] satisfies Prisma.DocumentCreateManyInput[];

const appointments = [
  appointment(
    ids.ownerAppointmentA,
    ids.orgA,
    ids.ownerPatientA,
    ids.ownerA,
    '2026-04-10T10:00:00.000Z',
    AppointmentStatus.COMPLETED,
    'Seed owner appointment note',
  ),
  appointment(
    ids.assignedAppointmentA,
    ids.orgA,
    ids.assignedPatientA,
    ids.psychologistAssignedA,
    '2026-04-12T11:00:00.000Z',
    AppointmentStatus.SCHEDULED,
    'Seed assigned appointment note',
  ),
  appointment(
    ids.appointmentWithoutNotesA,
    ids.orgA,
    ids.assignedPatientA,
    ids.psychologistAssignedA,
    '2026-04-20T12:00:00.000Z',
    AppointmentStatus.CANCELLED,
    null,
  ),
  appointment(
    ids.appointmentB,
    ids.orgB,
    ids.patientB,
    ids.psychologistB,
    '2026-04-15T09:00:00.000Z',
    AppointmentStatus.COMPLETED,
    'Seed tenant B appointment note',
  ),
] satisfies Prisma.AppointmentCreateManyInput[];

const transactions = [
  transaction({
    id: ids.incomeA,
    organizationId: ids.orgA,
    type: FinancialTransactionType.INCOME,
    status: FinancialTransactionStatus.COMPLETED,
    category: FinancialTransactionCategory.SESSION,
    amount: 1200,
    concept: 'Tenant A session income',
    occurredAt: '2026-04-10T11:00:00.000Z',
    paymentMethod: PaymentMethod.TRANSFER,
    patientId: ids.ownerPatientA,
    appointmentId: ids.ownerAppointmentA,
    createdById: ids.billingA,
  }),
  transaction({
    id: ids.expenseA,
    organizationId: ids.orgA,
    type: FinancialTransactionType.EXPENSE,
    status: FinancialTransactionStatus.COMPLETED,
    category: FinancialTransactionCategory.RENT,
    amount: 300,
    concept: 'Tenant A office rent',
    occurredAt: '2026-04-11T12:00:00.000Z',
    paymentMethod: PaymentMethod.CASH,
    createdById: ids.billingA,
  }),
  transaction({
    id: ids.adjustmentA,
    organizationId: ids.orgA,
    type: FinancialTransactionType.ADJUSTMENT,
    status: FinancialTransactionStatus.COMPLETED,
    category: FinancialTransactionCategory.MANUAL,
    amount: 50,
    concept: 'Tenant A manual adjustment',
    occurredAt: '2026-04-12T12:00:00.000Z',
    paymentMethod: PaymentMethod.CARD,
    createdById: ids.billingA,
  }),
  transaction({
    id: ids.refundA,
    organizationId: ids.orgA,
    type: FinancialTransactionType.REFUND,
    status: FinancialTransactionStatus.COMPLETED,
    category: FinancialTransactionCategory.SESSION,
    amount: 100,
    concept: 'Tenant A partial refund',
    occurredAt: '2026-04-13T12:00:00.000Z',
    paymentMethod: PaymentMethod.TRANSFER,
    patientId: ids.assignedPatientA,
    createdById: ids.billingA,
  }),
  transaction({
    id: ids.pendingIncomeA,
    organizationId: ids.orgA,
    type: FinancialTransactionType.INCOME,
    status: FinancialTransactionStatus.PENDING,
    category: FinancialTransactionCategory.SESSION,
    amount: 800,
    concept: 'Tenant A pending scheduled session',
    occurredAt: '2026-04-20T12:00:00.000Z',
    dueDate: '2026-04-20T12:00:00.000Z',
    patientId: ids.assignedPatientA,
    appointmentId: ids.appointmentWithoutNotesA,
    createdById: ids.billingA,
  }),
  transaction({
    id: ids.incomeB,
    organizationId: ids.orgB,
    type: FinancialTransactionType.INCOME,
    status: FinancialTransactionStatus.COMPLETED,
    category: FinancialTransactionCategory.SESSION,
    amount: 999,
    concept: 'Tenant B session income',
    occurredAt: '2026-04-10T11:00:00.000Z',
    paymentMethod: PaymentMethod.TRANSFER,
    patientId: ids.patientB,
    appointmentId: ids.appointmentB,
    createdById: ids.ownerB,
  }),
  transaction({
    id: ids.expenseB,
    organizationId: ids.orgB,
    type: FinancialTransactionType.EXPENSE,
    status: FinancialTransactionStatus.COMPLETED,
    category: FinancialTransactionCategory.SOFTWARE,
    amount: 111,
    concept: 'Tenant B software expense',
    occurredAt: '2026-04-12T11:00:00.000Z',
    paymentMethod: PaymentMethod.CARD,
    createdById: ids.ownerB,
  }),
] satisfies Prisma.FinancialTransactionCreateManyInput[];

const tenantAExpectedSummary = {
  incomeTotal: 2000,
  expenseTotal: 300,
  adjustmentTotal: 50,
  refundTotal: 100,
  netTotal: 1650,
  transactionCount: 5,
};

function organization(
  id: string,
  slug: string,
  displayName: string,
  status: OrganizationStatus = OrganizationStatus.ACTIVE,
) {
  return {
    id,
    slug,
    legalName: `${displayName} S.C.`,
    displayName,
    status,
    timezone: 'America/Hermosillo',
    locale: 'es-MX',
    currency: 'MXN',
  };
}

function user(
  id: string,
  name: string,
  email: string,
  role: UserRole = UserRole.PSYCHOLOGIST,
  preferredOrganizationId: string | null = null,
): SeedUser {
  return {
    id,
    name,
    email,
    normalizedEmail: normalizeEmailIdentity(email),
    role,
    preferredOrganizationId,
  };
}

function membership(
  id: string,
  organizationId: string,
  userId: string,
  role: MembershipRole,
  status: MembershipStatus = MembershipStatus.ACTIVE,
) {
  return {
    id,
    organizationId,
    userId,
    role,
    status,
    joinedAt:
      status === MembershipStatus.ACTIVE
        ? new Date('2026-01-01T00:00:00.000Z')
        : null,
    suspendedAt:
      status === MembershipStatus.SUSPENDED
        ? new Date('2026-01-02T00:00:00.000Z')
        : null,
  };
}

function patient(
  id: string,
  organizationId: string,
  psychologistId: string,
  firstName: string,
  lastName: string,
  email: string,
) {
  return {
    id,
    organizationId,
    psychologistId,
    firstName,
    lastName,
    email,
    phoneNumber: '+526621230000',
    birthDate: new Date('1990-01-01T00:00:00.000Z'),
  };
}

function assignment(
  organizationId: string,
  patientId: string,
  membershipId: string,
) {
  return {
    organizationId,
    patientId,
    membershipId,
    role: PatientAssignmentRole.PRIMARY,
    status: PatientAssignmentStatus.ACTIVE,
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    creationReason: `${SEED_TAG} deterministic development assignment`,
    createdByMembershipId: membershipId,
  };
}

function caseFile(
  id: string,
  organizationId: string,
  patientId: string,
  diagnosis: string,
  treatmentPlan: string,
) {
  return { id, organizationId, patientId, diagnosis, treatmentPlan };
}

function sessionNote(
  id: string,
  organizationId: string,
  caseFileId: string,
  authorId: string,
  title: string,
) {
  return {
    id,
    organizationId,
    caseFileId,
    authorId,
    sessionDate: new Date('2026-04-01T10:00:00.000Z'),
    title,
    content: `${SEED_TAG} synthetic clinical note for local development only.`,
  };
}

function document(
  id: string,
  organizationId: string,
  caseFileId: string,
  uploadedById: string,
  patientId: string,
  fileName: string,
) {
  return {
    id,
    organizationId,
    caseFileId,
    uploadedById,
    fileName,
    filePath: `patients/${patientId}/${fileName}`,
    mimeType: 'application/pdf',
  };
}

function appointment(
  id: string,
  organizationId: string,
  patientId: string,
  psychologistId: string,
  scheduledAt: string,
  status: AppointmentStatus,
  notes: string | null,
) {
  return {
    id,
    organizationId,
    patientId,
    psychologistId,
    scheduledAt: new Date(scheduledAt),
    durationMinutes: 50,
    status,
    notes,
  };
}

function transaction(data: {
  id: string;
  organizationId: string;
  type: FinancialTransactionType;
  status: FinancialTransactionStatus;
  category: FinancialTransactionCategory;
  amount: number;
  concept: string;
  occurredAt: string;
  createdById: string;
  dueDate?: string;
  paymentMethod?: PaymentMethod;
  patientId?: string;
  appointmentId?: string;
}) {
  return {
    id: data.id,
    organizationId: data.organizationId,
    type: data.type,
    status: data.status,
    category: data.category,
    amount: data.amount,
    currency: 'MXN',
    concept: data.concept,
    description: `${SEED_TAG} synthetic financial transaction`,
    occurredAt: new Date(data.occurredAt),
    dueDate: data.dueDate ? new Date(data.dueDate) : null,
    paymentMethod: data.paymentMethod ?? null,
    notes: `${SEED_TAG} local-only transaction`,
    patientId: data.patientId ?? null,
    appointmentId: data.appointmentId ?? null,
    createdById: data.createdById,
  };
}

async function resetTenantDevelopmentSeed() {
  await cleanupSeedDocumentFiles();

  const organizationIds = organizations.map(
    (seedOrganization) => seedOrganization.id,
  );
  const userIds = users.map((seedUser) => seedUser.id);
  const membershipIds = memberships.map(
    (seedMembership) => seedMembership.id as string,
  );
  const patientIds = patients.map((seedPatient) => seedPatient.id as string);
  const caseFileIds = caseFiles.map(
    (seedCaseFile) => seedCaseFile.id as string,
  );
  const appointmentIds = appointments.map(
    (seedAppointment) => seedAppointment.id as string,
  );

  await prisma.$transaction([
    prisma.financialTransaction.deleteMany({
      where: {
        OR: [
          {
            id: {
              in: transactions.map(
                (seedTransaction) => seedTransaction.id as string,
              ),
            },
          },
          { organizationId: { in: organizationIds } },
          { patientId: { in: patientIds } },
          { appointmentId: { in: appointmentIds } },
          { createdById: { in: userIds } },
        ],
      },
    }),
    prisma.document.deleteMany({
      where: {
        OR: [
          {
            id: {
              in: documents.map((seedDocument) => seedDocument.id as string),
            },
          },
          { organizationId: { in: organizationIds } },
          { caseFileId: { in: caseFileIds } },
        ],
      },
    }),
    prisma.sessionNote.deleteMany({
      where: {
        OR: [
          { id: { in: sessionNotes.map((seedNote) => seedNote.id as string) } },
          { organizationId: { in: organizationIds } },
          { caseFileId: { in: caseFileIds } },
          { authorId: { in: userIds } },
        ],
      },
    }),
    prisma.appointment.deleteMany({
      where: {
        OR: [
          { id: { in: appointmentIds } },
          { organizationId: { in: organizationIds } },
          { patientId: { in: patientIds } },
          { psychologistId: { in: userIds } },
        ],
      },
    }),
    prisma.caseFile.deleteMany({
      where: {
        OR: [
          { id: { in: caseFileIds } },
          { organizationId: { in: organizationIds } },
          { patientId: { in: patientIds } },
        ],
      },
    }),
    prisma.patientAssignment.deleteMany({
      where: {
        OR: [
          { organizationId: { in: organizationIds } },
          { patientId: { in: patientIds } },
          { membershipId: { in: membershipIds } },
        ],
      },
    }),
    prisma.patient.deleteMany({
      where: {
        OR: [
          { id: { in: patientIds } },
          { organizationId: { in: organizationIds } },
          { psychologistId: { in: userIds } },
          {
            email: {
              in: patients.map((seedPatient) => seedPatient.email as string),
            },
          },
        ],
      },
    }),
    prisma.organizationInvitation.deleteMany({
      where: { organizationId: { in: organizationIds } },
    }),
    prisma.psychologistProfile.deleteMany({
      where: { userId: { in: userIds } },
    }),
    prisma.organizationMembership.deleteMany({
      where: {
        OR: [
          { id: { in: membershipIds } },
          { organizationId: { in: organizationIds } },
          { userId: { in: userIds } },
        ],
      },
    }),
    prisma.organizationSettings.deleteMany({
      where: { organizationId: { in: organizationIds } },
    }),
    prisma.organizationBranding.deleteMany({
      where: { organizationId: { in: organizationIds } },
    }),
    prisma.organization.deleteMany({
      where: {
        OR: [
          { id: { in: organizationIds } },
          {
            slug: {
              in: organizations.map(
                (seedOrganization) => seedOrganization.slug,
              ),
            },
          },
        ],
      },
    }),
    prisma.user.deleteMany({
      where: {
        OR: [
          { id: { in: userIds } },
          { email: { in: users.map((seedUser) => seedUser.email) } },
        ],
      },
    }),
  ]);
}

async function cleanupSeedDocumentFiles() {
  const uploadsRoot = resolve(
    process.cwd(),
    process.env.UPLOADS_PATH ?? 'uploads',
  );

  await Promise.all(
    documents.map(async (seedDocument) => {
      await rm(resolve(uploadsRoot, seedDocument.filePath), { force: true });
    }),
  );
}

async function createSeedDocumentFiles() {
  const uploadsRoot = resolve(
    process.cwd(),
    process.env.UPLOADS_PATH ?? 'uploads',
  );

  await Promise.all(
    documents.map(async (seedDocument) => {
      const filePath = resolve(uploadsRoot, seedDocument.filePath);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(
        filePath,
        `%PDF-1.7\n% ${SEED_TAG} synthetic local document\n`,
      );
    }),
  );
}

async function seedTenantDevelopmentData(passwordHash: string) {
  await prisma.organization.createMany({ data: organizations });
  await prisma.user.createMany({
    data: users.map((seedUser) => ({
      ...seedUser,
      passwordHash,
    })),
  });

  await prisma.$transaction([
    prisma.organizationSettings.createMany({
      data: organizations.map((seedOrganization) => ({
        organizationId: seedOrganization.id,
        weekStartsOn: 1,
        defaultAppointmentDuration: 50,
      })),
    }),
    prisma.organizationBranding.createMany({
      data: [
        {
          organizationId: ids.orgA,
          visualName: 'Tenant Dev A',
          primaryColor: '#2563eb',
          accentColor: '#16a34a',
        },
        {
          organizationId: ids.orgB,
          visualName: 'Tenant Dev B',
          primaryColor: '#0f766e',
          accentColor: '#ca8a04',
        },
      ],
    }),
    prisma.psychologistProfile.createMany({
      data: [
        psychologistProfile(
          ids.psychologistAssignedA,
          'Psychologist Assigned A',
        ),
        psychologistProfile(
          ids.psychologistUnassignedA,
          'Psychologist Unassigned A',
        ),
        psychologistProfile(ids.psychologistB, 'Psychologist B'),
        psychologistProfile(ids.ownerA, 'Owner A'),
        psychologistProfile(ids.multiMember, 'Multi Member'),
      ],
    }),
  ]);

  await prisma.$transaction([
    prisma.organizationMembership.createMany({ data: memberships }),
    prisma.patient.createMany({ data: patients }),
  ]);

  await prisma.$transaction([
    prisma.patientAssignment.createMany({ data: assignments }),
    prisma.caseFile.createMany({ data: caseFiles }),
  ]);

  await prisma.$transaction([
    prisma.sessionNote.createMany({ data: sessionNotes }),
    prisma.appointment.createMany({ data: appointments }),
  ]);

  await createSeedDocumentFiles();

  await prisma.$transaction([
    prisma.document.createMany({ data: documents }),
    prisma.financialTransaction.createMany({ data: transactions }),
  ]);
}

function psychologistProfile(userId: string, professionalName: string) {
  return {
    userId,
    professionalName,
    status: PsychologistProfileStatus.ACTIVE,
    verifiedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function countBy<T extends string>(values: T[]) {
  return values.reduce(
    (accumulator, value) => ({
      ...accumulator,
      [value]: (accumulator[value] ?? 0) + 1,
    }),
    {} as Record<T, number>,
  );
}

async function main() {
  const demoPassword = requireDemoSeedPassword(
    process.env.SEED_DEMO_PASSWORD ?? DEFAULT_LOCAL_PASSWORD,
  );
  const passwordHash = await bcrypt.hash(demoPassword, 10);

  await resetTenantDevelopmentSeed();
  await seedTenantDevelopmentData(passwordHash);

  console.log('Tenant-aware development seed completed successfully.');
  console.log('Data set: synthetic local development fixtures only.');
  console.log(`Organizations seeded: ${organizations.length}`);
  console.log(`Users seeded: ${users.length}`);
  console.log(`Memberships seeded: ${memberships.length}`);
  console.log(`Patients seeded: ${patients.length}`);
  console.log(`Case files seeded: ${caseFiles.length}`);
  console.log(`Session notes seeded: ${sessionNotes.length}`);
  console.log(`Documents seeded: ${documents.length}`);
  console.log(`Appointments seeded: ${appointments.length}`);
  console.log(`Financial transactions seeded: ${transactions.length}`);
  console.log(
    `Membership roles: ${JSON.stringify(countBy(memberships.map((seedMembership) => seedMembership.role)))}`,
  );
  console.log(
    `Financial transactions by type: ${JSON.stringify(countBy(transactions.map((seedTransaction) => seedTransaction.type)))}`,
  );
  console.log(`Tenant A organizationId: ${ids.orgA}`);
  console.log(`Tenant B organizationId: ${ids.orgB}`);
  console.log(`Suspended organizationId: ${ids.orgSuspended}`);
  console.log('Local login emails:');
  users.forEach((seedUser) => console.log(`- ${seedUser.email}`));
  console.log(
    `Tenant A expected summary: ${JSON.stringify(tenantAExpectedSummary)}`,
  );
  console.log(
    'Local password source: SEED_DEMO_PASSWORD or documented fallback for local development.',
  );
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
