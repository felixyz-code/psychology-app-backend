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
import { seedCommercialCoreData } from './seed-commercial';
import { seedAllStockInstruments } from './seeds/stock-instruments-seed';

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
  branchA1: seedUuid(34000000, 1),
  branchA2: seedUuid(34000000, 2),
  branchB1: seedUuid(34000000, 3),
  userBranchAccessA1Owner: seedUuid(35000000, 1),
  userBranchAccessA1Admin: seedUuid(35000000, 2),
  userBranchAccessA2Admin: seedUuid(35000000, 3),
  userBranchAccessA1PsychAssigned: seedUuid(35000000, 4),
  userBranchAccessA2PsychUnassigned: seedUuid(35000000, 5),
  userBranchAccessB1Owner: seedUuid(35000000, 6),
  userBranchAccessB1Psych: seedUuid(35000000, 7),
  userBranchAccessMultiA: seedUuid(35000000, 8),
  userBranchAccessMultiB: seedUuid(35000000, 9),
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

const branches = [
  {
    id: ids.branchA1,
    organizationId: ids.orgA,
    name: 'Sede Central (Matriz)',
    code: 'CDMX-CENTRO',
    address: 'Av. Insurgentes Sur 1234, CDMX',
    phone: '+525512345678',
    timezone: 'America/Mexico_City',
    isActive: true,
  },
  {
    id: ids.branchA2,
    organizationId: ids.orgA,
    name: 'Sede Norte',
    code: 'CDMX-NORTE',
    address: 'Av. Politécnico 456, CDMX',
    phone: '+525587654321',
    timezone: 'America/Mexico_City',
    isActive: true,
  },
  {
    id: ids.branchB1,
    organizationId: ids.orgB,
    name: 'Sede Principal',
    code: 'GDL-MATRIZ',
    address: 'Av. Vallarta 789, Guadalajara',
    phone: '+523312345678',
    timezone: 'America/Mexico_City',
    isActive: true,
  },
] satisfies Prisma.BranchCreateManyInput[];

const userBranchAccesses = [
  {
    id: ids.userBranchAccessA1Owner,
    organizationId: ids.orgA,
    userId: ids.ownerA,
    branchId: ids.branchA1,
    isPrimary: true,
  },
  {
    id: ids.userBranchAccessA1Admin,
    organizationId: ids.orgA,
    userId: ids.adminA,
    branchId: ids.branchA1,
    isPrimary: true,
  },
  {
    id: ids.userBranchAccessA2Admin,
    organizationId: ids.orgA,
    userId: ids.adminA,
    branchId: ids.branchA2,
    isPrimary: false,
  },
  {
    id: ids.userBranchAccessA1PsychAssigned,
    organizationId: ids.orgA,
    userId: ids.psychologistAssignedA,
    branchId: ids.branchA1,
    isPrimary: true,
  },
  {
    id: ids.userBranchAccessA2PsychUnassigned,
    organizationId: ids.orgA,
    userId: ids.psychologistUnassignedA,
    branchId: ids.branchA2,
    isPrimary: true,
  },
  {
    id: ids.userBranchAccessB1Owner,
    organizationId: ids.orgB,
    userId: ids.ownerB,
    branchId: ids.branchB1,
    isPrimary: true,
  },
  {
    id: ids.userBranchAccessB1Psych,
    organizationId: ids.orgB,
    userId: ids.psychologistB,
    branchId: ids.branchB1,
    isPrimary: true,
  },
  {
    id: ids.userBranchAccessMultiA,
    organizationId: ids.orgA,
    userId: ids.multiMember,
    branchId: ids.branchA1,
    isPrimary: true,
  },
  {
    id: ids.userBranchAccessMultiB,
    organizationId: ids.orgB,
    userId: ids.multiMember,
    branchId: ids.branchB1,
    isPrimary: true,
  },
] satisfies Prisma.UserBranchAccessCreateManyInput[];

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
  patient(
    seedUuid(25000000, 7),
    ids.orgA,
    ids.ownerA,
    'Ana Lucía',
    'Hernández Soto',
    'ana.lucia.hernandez@example.test',
    { phoneNumber: '+526621230107', birthDate: '1988-02-14' },
  ),
  patient(
    seedUuid(25000000, 8),
    ids.orgA,
    ids.ownerA,
    'Diego',
    'Ramírez Soto',
    'diego.ramirez@example.test',
    { phoneNumber: '+526621230108', birthDate: '1995-07-03' },
  ),
  patient(
    seedUuid(25000000, 9),
    ids.orgA,
    ids.ownerA,
    'Fernanda',
    'López Vega',
    'fernanda.lopez@example.test',
    { phoneNumber: '+526621230109', birthDate: '1992-11-21' },
  ),
  patient(
    seedUuid(25000000, 10),
    ids.orgA,
    ids.ownerA,
    'Gabriel',
    'Torres Núñez',
    'gabriel.torres@example.test',
    { phoneNumber: '+526621230110', birthDate: '1984-05-09' },
  ),
  patient(
    seedUuid(25000000, 11),
    ids.orgA,
    ids.ownerA,
    'Isabel',
    'Moreno Díaz',
    'isabel.moreno@example.test',
    { phoneNumber: '+526621230111', birthDate: '2000-01-30' },
  ),
  patient(
    seedUuid(25000000, 12),
    ids.orgA,
    ids.ownerA,
    'Javier',
    'Castillo Ruiz',
    'javier.castillo@example.test',
    { phoneNumber: '+526621230112', birthDate: '1979-09-18' },
  ),
  patient(
    seedUuid(25000000, 13),
    ids.orgA,
    ids.ownerA,
    'Karla',
    'Méndez Flores',
    'karla.mendez@example.test',
    { phoneNumber: '+526621230113', birthDate: '1997-04-12' },
  ),
  patient(
    seedUuid(25000000, 14),
    ids.orgA,
    ids.ownerA,
    'Luis Alberto',
    'Navarro Gil',
    'luis.navarro@example.test',
    { phoneNumber: '+526621230114', birthDate: '1986-12-06' },
  ),
  patient(
    seedUuid(25000000, 15),
    ids.orgA,
    ids.ownerA,
    'Mónica',
    'Reyes Campos',
    'monica.reyes@example.test',
    { phoneNumber: '+526621230115', birthDate: '1991-08-25' },
  ),
  patient(
    seedUuid(25000000, 16),
    ids.orgA,
    ids.ownerA,
    'Natalia',
    'Salazar Cruz',
    'natalia.salazar@example.test',
    { phoneNumber: null, birthDate: '2002-03-17' },
  ),
  patient(
    seedUuid(25000000, 17),
    ids.orgA,
    ids.ownerA,
    'Óscar',
    'Valdez Ibarra',
    'oscar.valdez@example.test',
    { phoneNumber: '+526621230117', birthDate: null },
  ),
  patient(
    seedUuid(25000000, 18),
    ids.orgB,
    ids.ownerB,
    'Elena',
    'Córdova Luna',
    'elena.cordova@example.test',
    { phoneNumber: '+526621230218', birthDate: '1989-06-11' },
  ),
  patient(
    seedUuid(25000000, 19),
    ids.orgB,
    ids.ownerB,
    'Héctor',
    'Paredes Gil',
    'hector.paredes@example.test',
    { phoneNumber: '+526621230219', birthDate: '1976-10-04' },
  ),
  patient(
    seedUuid(25000000, 20),
    ids.orgB,
    ids.psychologistB,
    'Irene',
    'Silva Mora',
    'irene.silva@example.test',
    { phoneNumber: '+526621230220', birthDate: '1994-02-28' },
  ),
  patient(
    seedUuid(25000000, 21),
    ids.orgB,
    ids.psychologistB,
    'Joaquín',
    'Fuentes Paz',
    'joaquin.fuentes@example.test',
    { phoneNumber: null, birthDate: '1982-07-19' },
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
  ...Array.from({ length: 11 }, (_, index) =>
    assignment(ids.orgA, seedUuid(25000000, index + 7), ids.ownerMembershipA),
  ),
  assignment(ids.orgB, seedUuid(25000000, 18), ids.ownerMembershipB),
  assignment(ids.orgB, seedUuid(25000000, 19), ids.ownerMembershipB),
  assignment(ids.orgB, seedUuid(25000000, 20), ids.psychologistMembershipB),
  assignment(ids.orgB, seedUuid(25000000, 21), ids.psychologistMembershipB),
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
  caseFile(
    seedUuid(26000000, 7),
    ids.orgA,
    seedUuid(25000000, 7),
    'Síntomas de ansiedad situacional en evaluación inicial',
    'Psicoeducación, registro de detonantes y técnicas de respiración',
  ),
  caseFile(
    seedUuid(26000000, 8),
    ids.orgA,
    seedUuid(25000000, 8),
    'Dificultades de adaptación ante cambios laborales',
    'Intervención breve centrada en recursos y solución de problemas',
  ),
  caseFile(
    seedUuid(26000000, 9),
    ids.orgA,
    seedUuid(25000000, 9),
    'Alteraciones leves del sueño pendientes de seguimiento',
    'Higiene del sueño y monitoreo semanal de hábitos',
  ),
  caseFile(
    seedUuid(26000000, 10),
    ids.orgA,
    seedUuid(25000000, 10),
    'Estrés asociado a responsabilidades de cuidado',
    'Activación conductual gradual y fortalecimiento de red de apoyo',
  ),
  caseFile(
    seedUuid(26000000, 11),
    ids.orgA,
    seedUuid(25000000, 11),
    'Motivo de consulta en proceso de evaluación clínica',
    'Entrevista clínica, definición colaborativa de objetivos y seguimiento',
  ),
  caseFile(
    seedUuid(26000000, 12),
    ids.orgA,
    seedUuid(25000000, 12),
    'Dificultades de comunicación interpersonal',
    'Entrenamiento en comunicación asertiva y límites saludables',
  ),
  caseFile(
    seedUuid(26000000, 13),
    ids.orgA,
    seedUuid(25000000, 13),
    'Ánimo bajo de intensidad leve, sujeto a reevaluación',
    'Programación de actividades valiosas y revisión quincenal',
  ),
  caseFile(
    seedUuid(26000000, 14),
    ids.orgA,
    seedUuid(25000000, 14),
    'Manejo de estrés académico y organización del tiempo',
    'Planificación semanal, pausas activas y reestructuración cognitiva',
  ),
  caseFile(
    seedUuid(26000000, 15),
    ids.orgB,
    seedUuid(25000000, 18),
    'Ansiedad anticipatoria en evaluación',
    'Registro de pensamientos y exposición gradual acordada',
  ),
  caseFile(
    seedUuid(26000000, 16),
    ids.orgB,
    seedUuid(25000000, 20),
    'Duelo por transición vital, sin diagnóstico definitivo',
    'Acompañamiento emocional y seguimiento de funcionamiento cotidiano',
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
  sessionNote(
    seedUuid(27000000, 4),
    ids.orgA,
    seedUuid(26000000, 7),
    ids.ownerA,
    'Entrevista inicial y objetivos',
    '2026-05-06T17:00:00.000Z',
    'Se exploró el motivo de consulta y se acordó iniciar un registro breve de situaciones que elevan la ansiedad.',
  ),
  sessionNote(
    seedUuid(27000000, 5),
    ids.orgA,
    seedUuid(26000000, 7),
    ids.ownerA,
    'Práctica de respiración diafragmática',
    '2026-05-20T17:00:00.000Z',
    'Se revisó el registro semanal y se practicó una técnica breve de regulación; la respuesta fue favorable.',
  ),
  sessionNote(
    seedUuid(27000000, 6),
    ids.orgA,
    seedUuid(26000000, 8),
    ids.ownerA,
    'Mapa de cambios recientes',
    '2026-06-02T16:00:00.000Z',
    'Se organizaron los cambios laborales recientes y se identificaron recursos personales disponibles.',
  ),
  sessionNote(
    seedUuid(27000000, 7),
    ids.orgA,
    seedUuid(26000000, 8),
    ids.ownerA,
    'Plan de solución de problemas',
    '2026-06-16T16:00:00.000Z',
    'Se definieron pasos pequeños y observables para atender una dificultad laboral prioritaria.',
  ),
  sessionNote(
    seedUuid(27000000, 8),
    ids.orgA,
    seedUuid(26000000, 9),
    ids.ownerA,
    'Revisión de rutina de sueño',
    '2026-06-25T18:00:00.000Z',
    'Se revisaron horarios, consumo de estimulantes y uso nocturno de pantallas con fines demostrativos.',
  ),
  sessionNote(
    seedUuid(27000000, 9),
    ids.orgA,
    seedUuid(26000000, 9),
    ids.ownerA,
    'Seguimiento de higiene del sueño',
    '2026-07-09T18:00:00.000Z',
    'La rutina mostró mayor consistencia; se acordó mantener el registro por dos semanas adicionales.',
  ),
  sessionNote(
    seedUuid(27000000, 10),
    ids.orgA,
    seedUuid(26000000, 10),
    ids.ownerA,
    'Exploración de carga de cuidado',
    '2026-07-14T15:00:00.000Z',
    'Se identificaron responsabilidades acumuladas y oportunidades realistas para solicitar apoyo.',
  ),
  sessionNote(
    seedUuid(27000000, 11),
    ids.orgA,
    seedUuid(26000000, 10),
    ids.ownerA,
    'Activación conductual',
    '2026-07-28T15:00:00.000Z',
    'Se programaron dos actividades breves asociadas con descanso y conexión social.',
  ),
  sessionNote(
    seedUuid(27000000, 12),
    ids.orgA,
    seedUuid(26000000, 11),
    ids.ownerA,
    'Evaluación de motivo de consulta',
    '2026-08-03T17:30:00.000Z',
    'Se recopilaron antecedentes generales y se mantuvo abierta la formulación clínica para próximas sesiones.',
  ),
  sessionNote(
    seedUuid(27000000, 13),
    ids.orgA,
    seedUuid(26000000, 11),
    ids.ownerA,
    'Definición colaborativa de metas',
    '2026-08-10T17:30:00.000Z',
    'Se priorizaron metas de autocuidado y organización cotidiana con indicadores concretos de avance.',
  ),
  sessionNote(
    seedUuid(27000000, 14),
    ids.orgA,
    seedUuid(26000000, 12),
    ids.ownerA,
    'Comunicación y límites',
    '2026-07-22T19:00:00.000Z',
    'Se ensayó una conversación asertiva y se definió una tarea de práctica entre sesiones.',
  ),
  sessionNote(
    seedUuid(27000000, 15),
    ids.orgA,
    seedUuid(26000000, 13),
    ids.ownerA,
    'Actividades valiosas',
    '2026-08-05T16:30:00.000Z',
    'Se seleccionaron actividades alcanzables y se revisaron barreras anticipadas para realizarlas.',
  ),
  sessionNote(
    seedUuid(27000000, 16),
    ids.orgA,
    seedUuid(26000000, 14),
    ids.ownerA,
    'Organización semanal',
    '2026-08-07T18:30:00.000Z',
    'Se construyó una agenda flexible con bloques de estudio, descanso y actividades personales.',
  ),
  sessionNote(
    seedUuid(27000000, 17),
    ids.orgB,
    seedUuid(26000000, 15),
    ids.ownerB,
    'Evaluación inicial de anticipación',
    '2026-06-18T17:00:00.000Z',
    'Se identificaron situaciones anticipatorias y respuestas corporales relevantes para el seguimiento.',
  ),
  sessionNote(
    seedUuid(27000000, 18),
    ids.orgB,
    seedUuid(26000000, 15),
    ids.ownerB,
    'Jerarquía gradual de situaciones',
    '2026-07-02T17:00:00.000Z',
    'Se organizó una jerarquía preliminar y se eligió un primer ejercicio de baja intensidad.',
  ),
  sessionNote(
    seedUuid(27000000, 19),
    ids.orgB,
    seedUuid(26000000, 16),
    ids.psychologistB,
    'Acompañamiento en transición vital',
    '2026-07-21T16:00:00.000Z',
    'Se validaron emociones asociadas con la transición y se revisaron apoyos cotidianos disponibles.',
  ),
  sessionNote(
    seedUuid(27000000, 20),
    ids.orgB,
    seedUuid(26000000, 16),
    ids.psychologistB,
    'Seguimiento de funcionamiento',
    '2026-08-04T16:00:00.000Z',
    'Se observó estabilidad en rutinas básicas y se acordó mantener seguimiento quincenal.',
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
  appointment(
    seedUuid(29000000, 5),
    ids.orgA,
    seedUuid(25000000, 7),
    ids.ownerA,
    '2026-05-06T17:00:00.000Z',
    AppointmentStatus.COMPLETED,
    'Entrevista inicial y definición de objetivos.',
  ),
  appointment(
    seedUuid(29000000, 6),
    ids.orgA,
    seedUuid(25000000, 8),
    ids.ownerA,
    '2026-06-02T16:00:00.000Z',
    AppointmentStatus.COMPLETED,
    null,
  ),
  appointment(
    seedUuid(29000000, 7),
    ids.orgA,
    seedUuid(25000000, 9),
    ids.ownerA,
    '2026-06-25T18:00:00.000Z',
    AppointmentStatus.NO_SHOW,
    'Se registró inasistencia y se envió recordatorio local de demostración.',
  ),
  appointment(
    seedUuid(29000000, 8),
    ids.orgA,
    seedUuid(25000000, 9),
    ids.ownerA,
    '2026-07-09T18:00:00.000Z',
    AppointmentStatus.COMPLETED,
    'Seguimiento de rutina de sueño.',
  ),
  appointment(
    seedUuid(29000000, 9),
    ids.orgA,
    seedUuid(25000000, 10),
    ids.ownerA,
    '2026-07-14T15:00:00.000Z',
    AppointmentStatus.COMPLETED,
    null,
  ),
  appointment(
    seedUuid(29000000, 10),
    ids.orgA,
    seedUuid(25000000, 11),
    ids.ownerA,
    '2026-08-03T17:30:00.000Z',
    AppointmentStatus.COMPLETED,
    'Evaluación inicial; formulación clínica abierta.',
  ),
  appointment(
    seedUuid(29000000, 11),
    ids.orgA,
    seedUuid(25000000, 12),
    ids.ownerA,
    '2026-08-05T19:00:00.000Z',
    AppointmentStatus.CANCELLED,
    null,
  ),
  appointment(
    seedUuid(29000000, 12),
    ids.orgA,
    seedUuid(25000000, 13),
    ids.ownerA,
    '2026-08-07T16:30:00.000Z',
    AppointmentStatus.COMPLETED,
    'Revisión de actividades valiosas.',
  ),
  appointment(
    seedUuid(29000000, 13),
    ids.orgA,
    seedUuid(25000000, 14),
    ids.ownerA,
    '2026-08-10T18:30:00.000Z',
    AppointmentStatus.SCHEDULED,
    'Organización semanal y manejo de carga académica.',
  ),
  appointment(
    seedUuid(29000000, 14),
    ids.orgA,
    seedUuid(25000000, 15),
    ids.ownerA,
    '2026-08-11T17:00:00.000Z',
    AppointmentStatus.SCHEDULED,
    null,
  ),
  appointment(
    seedUuid(29000000, 15),
    ids.orgA,
    seedUuid(25000000, 16),
    ids.ownerA,
    '2026-08-12T16:00:00.000Z',
    AppointmentStatus.SCHEDULED,
    'Primera entrevista de evaluación.',
  ),
  appointment(
    seedUuid(29000000, 16),
    ids.orgA,
    seedUuid(25000000, 17),
    ids.ownerA,
    '2026-08-14T18:00:00.000Z',
    AppointmentStatus.SCHEDULED,
    null,
  ),
  appointment(
    seedUuid(29000000, 17),
    ids.orgA,
    ids.assignedPatientA,
    ids.psychologistAssignedA,
    '2026-08-18T17:00:00.000Z',
    AppointmentStatus.SCHEDULED,
    'Seguimiento del fixture asignado.',
  ),
  appointment(
    seedUuid(29000000, 18),
    ids.orgA,
    ids.multiPatientA,
    ids.multiMember,
    '2026-08-22T16:00:00.000Z',
    AppointmentStatus.SCHEDULED,
    null,
  ),
  appointment(
    seedUuid(29000000, 19),
    ids.orgA,
    seedUuid(25000000, 7),
    ids.ownerA,
    '2026-09-01T17:00:00.000Z',
    AppointmentStatus.SCHEDULED,
    'Revisión mensual de avances.',
  ),
  appointment(
    seedUuid(29000000, 20),
    ids.orgA,
    seedUuid(25000000, 8),
    ids.ownerA,
    '2026-09-10T16:00:00.000Z',
    AppointmentStatus.SCHEDULED,
    null,
  ),
  appointment(
    seedUuid(29000000, 21),
    ids.orgA,
    seedUuid(25000000, 10),
    ids.ownerA,
    '2026-10-05T15:00:00.000Z',
    AppointmentStatus.SCHEDULED,
    'Seguimiento programado a mediano plazo.',
  ),
  appointment(
    seedUuid(29000000, 22),
    ids.orgB,
    seedUuid(25000000, 18),
    ids.ownerB,
    '2026-08-02T17:00:00.000Z',
    AppointmentStatus.COMPLETED,
    'Evaluación inicial en Tenant B.',
  ),
  appointment(
    seedUuid(29000000, 23),
    ids.orgB,
    seedUuid(25000000, 19),
    ids.ownerB,
    '2026-08-09T18:00:00.000Z',
    AppointmentStatus.SCHEDULED,
    null,
  ),
  appointment(
    seedUuid(29000000, 24),
    ids.orgB,
    seedUuid(25000000, 20),
    ids.psychologistB,
    '2026-08-11T16:00:00.000Z',
    AppointmentStatus.SCHEDULED,
    'Seguimiento de transición vital.',
  ),
  appointment(
    seedUuid(29000000, 25),
    ids.orgB,
    seedUuid(25000000, 21),
    ids.psychologistB,
    '2026-08-15T17:30:00.000Z',
    AppointmentStatus.NO_SHOW,
    null,
  ),
  appointment(
    seedUuid(29000000, 26),
    ids.orgB,
    ids.multiPatientB,
    ids.multiMember,
    '2026-08-25T19:00:00.000Z',
    AppointmentStatus.CANCELLED,
    'Cita cancelada para demostrar variedad de estados.',
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
  transaction({
    id: seedUuid(30000000, 8),
    organizationId: ids.orgA,
    type: FinancialTransactionType.INCOME,
    status: FinancialTransactionStatus.COMPLETED,
    category: FinancialTransactionCategory.ASSESSMENT,
    amount: 950,
    concept: 'Evaluación inicial de mayo',
    occurredAt: '2026-05-06T18:00:00.000Z',
    paymentMethod: PaymentMethod.CARD,
    patientId: seedUuid(25000000, 7),
    appointmentId: seedUuid(29000000, 5),
    createdById: ids.billingA,
  }),
  transaction({
    id: seedUuid(30000000, 9),
    organizationId: ids.orgA,
    type: FinancialTransactionType.INCOME,
    status: FinancialTransactionStatus.COMPLETED,
    category: FinancialTransactionCategory.SESSION,
    amount: 700,
    concept: 'Sesión individual de junio',
    occurredAt: '2026-06-02T17:00:00.000Z',
    paymentMethod: PaymentMethod.CASH,
    patientId: seedUuid(25000000, 8),
    appointmentId: seedUuid(29000000, 6),
    createdById: ids.billingA,
  }),
  transaction({
    id: seedUuid(30000000, 10),
    organizationId: ids.orgA,
    type: FinancialTransactionType.EXPENSE,
    status: FinancialTransactionStatus.COMPLETED,
    category: FinancialTransactionCategory.UTILITIES,
    amount: 180,
    concept: 'Servicio de internet del consultorio',
    occurredAt: '2026-06-05T12:00:00.000Z',
    paymentMethod: PaymentMethod.TRANSFER,
    createdById: ids.billingA,
  }),
  transaction({
    id: seedUuid(30000000, 11),
    organizationId: ids.orgA,
    type: FinancialTransactionType.INCOME,
    status: FinancialTransactionStatus.COMPLETED,
    category: FinancialTransactionCategory.SESSION,
    amount: 750,
    concept: 'Seguimiento de higiene del sueño',
    occurredAt: '2026-07-09T19:00:00.000Z',
    paymentMethod: PaymentMethod.TRANSFER,
    patientId: seedUuid(25000000, 9),
    appointmentId: seedUuid(29000000, 8),
    createdById: ids.billingA,
  }),
  transaction({
    id: seedUuid(30000000, 12),
    organizationId: ids.orgA,
    type: FinancialTransactionType.INCOME,
    status: FinancialTransactionStatus.PENDING,
    category: FinancialTransactionCategory.ASSESSMENT,
    amount: 1100,
    concept: 'Evaluación clínica pendiente de pago',
    occurredAt: '2026-07-14T16:00:00.000Z',
    dueDate: '2026-08-14T16:00:00.000Z',
    paymentMethod: PaymentMethod.CHECK,
    patientId: seedUuid(25000000, 10),
    appointmentId: seedUuid(29000000, 9),
    createdById: ids.billingA,
  }),
  transaction({
    id: seedUuid(30000000, 13),
    organizationId: ids.orgA,
    type: FinancialTransactionType.EXPENSE,
    status: FinancialTransactionStatus.COMPLETED,
    category: FinancialTransactionCategory.SUPPLIES,
    amount: 240,
    concept: 'Material de papelería clínica',
    occurredAt: '2026-07-16T12:00:00.000Z',
    paymentMethod: PaymentMethod.CASH,
    createdById: ids.billingA,
  }),
  transaction({
    id: seedUuid(30000000, 14),
    organizationId: ids.orgA,
    type: FinancialTransactionType.ADJUSTMENT,
    status: FinancialTransactionStatus.COMPLETED,
    category: FinancialTransactionCategory.MANUAL,
    amount: 75,
    concept: 'Ajuste de conciliación de julio',
    occurredAt: '2026-07-31T20:00:00.000Z',
    paymentMethod: PaymentMethod.OTHER,
    createdById: ids.billingA,
  }),
  transaction({
    id: seedUuid(30000000, 15),
    organizationId: ids.orgA,
    type: FinancialTransactionType.REFUND,
    status: FinancialTransactionStatus.COMPLETED,
    category: FinancialTransactionCategory.SESSION,
    amount: 200,
    concept: 'Reembolso parcial por paquete de sesiones',
    occurredAt: '2026-08-01T17:00:00.000Z',
    paymentMethod: PaymentMethod.CARD,
    patientId: seedUuid(25000000, 7),
    appointmentId: seedUuid(29000000, 5),
    createdById: ids.billingA,
  }),
  transaction({
    id: seedUuid(30000000, 16),
    organizationId: ids.orgA,
    type: FinancialTransactionType.INCOME,
    status: FinancialTransactionStatus.CANCELLED,
    category: FinancialTransactionCategory.SESSION,
    amount: 650,
    concept: 'Cobro cancelado por cita reprogramada',
    occurredAt: '2026-08-05T19:30:00.000Z',
    paymentMethod: PaymentMethod.TRANSFER,
    patientId: seedUuid(25000000, 12),
    appointmentId: seedUuid(29000000, 11),
    createdById: ids.billingA,
  }),
  transaction({
    id: seedUuid(30000000, 17),
    organizationId: ids.orgA,
    type: FinancialTransactionType.EXPENSE,
    status: FinancialTransactionStatus.COMPLETED,
    category: FinancialTransactionCategory.SOFTWARE,
    amount: 450,
    concept: 'Licencia mensual de herramientas de oficina',
    occurredAt: '2026-08-06T12:00:00.000Z',
    paymentMethod: PaymentMethod.CARD,
    createdById: ids.billingA,
  }),
  transaction({
    id: seedUuid(30000000, 18),
    organizationId: ids.orgA,
    type: FinancialTransactionType.INCOME,
    status: FinancialTransactionStatus.COMPLETED,
    category: FinancialTransactionCategory.SESSION,
    amount: 800,
    concept: 'Sesión de organización semanal',
    occurredAt: '2026-08-10T19:30:00.000Z',
    paymentMethod: PaymentMethod.TRANSFER,
    patientId: seedUuid(25000000, 14),
    appointmentId: seedUuid(29000000, 13),
    createdById: ids.billingA,
  }),
  transaction({
    id: seedUuid(30000000, 19),
    organizationId: ids.orgA,
    type: FinancialTransactionType.INCOME,
    status: FinancialTransactionStatus.COMPLETED,
    category: FinancialTransactionCategory.SESSION,
    amount: 850,
    concept: 'Sesión individual de agosto',
    occurredAt: '2026-08-11T18:00:00.000Z',
    paymentMethod: PaymentMethod.CASH,
    patientId: seedUuid(25000000, 15),
    appointmentId: seedUuid(29000000, 14),
    createdById: ids.billingA,
  }),
  transaction({
    id: seedUuid(30000000, 20),
    organizationId: ids.orgA,
    type: FinancialTransactionType.EXPENSE,
    status: FinancialTransactionStatus.PENDING,
    category: FinancialTransactionCategory.SALARY,
    amount: 1200,
    concept: 'Honorarios administrativos pendientes',
    occurredAt: '2026-08-12T12:00:00.000Z',
    dueDate: '2026-08-31T12:00:00.000Z',
    paymentMethod: PaymentMethod.TRANSFER,
    createdById: ids.billingA,
  }),
  transaction({
    id: seedUuid(30000000, 21),
    organizationId: ids.orgA,
    type: FinancialTransactionType.ADJUSTMENT,
    status: FinancialTransactionStatus.COMPLETED,
    category: FinancialTransactionCategory.OTHER,
    amount: 125,
    concept: 'Ajuste por diferencia de caja',
    occurredAt: '2026-08-15T20:00:00.000Z',
    paymentMethod: PaymentMethod.OTHER,
    createdById: ids.billingA,
  }),
  transaction({
    id: seedUuid(30000000, 22),
    organizationId: ids.orgA,
    type: FinancialTransactionType.REFUND,
    status: FinancialTransactionStatus.PENDING,
    category: FinancialTransactionCategory.ASSESSMENT,
    amount: 150,
    concept: 'Reembolso pendiente de evaluación',
    occurredAt: '2026-08-18T12:00:00.000Z',
    dueDate: '2026-08-25T12:00:00.000Z',
    paymentMethod: PaymentMethod.CHECK,
    patientId: seedUuid(25000000, 10),
    appointmentId: seedUuid(29000000, 9),
    createdById: ids.billingA,
  }),
  transaction({
    id: seedUuid(30000000, 23),
    organizationId: ids.orgB,
    type: FinancialTransactionType.INCOME,
    status: FinancialTransactionStatus.COMPLETED,
    category: FinancialTransactionCategory.ASSESSMENT,
    amount: 900,
    concept: 'Tenant B evaluación inicial',
    occurredAt: '2026-08-02T18:00:00.000Z',
    paymentMethod: PaymentMethod.CARD,
    patientId: seedUuid(25000000, 18),
    appointmentId: seedUuid(29000000, 22),
    createdById: ids.ownerB,
  }),
  transaction({
    id: seedUuid(30000000, 24),
    organizationId: ids.orgB,
    type: FinancialTransactionType.INCOME,
    status: FinancialTransactionStatus.PENDING,
    category: FinancialTransactionCategory.SESSION,
    amount: 650,
    concept: 'Tenant B sesión pendiente',
    occurredAt: '2026-08-11T17:00:00.000Z',
    dueDate: '2026-08-20T17:00:00.000Z',
    paymentMethod: PaymentMethod.TRANSFER,
    patientId: seedUuid(25000000, 20),
    appointmentId: seedUuid(29000000, 24),
    createdById: ids.ownerB,
  }),
  transaction({
    id: seedUuid(30000000, 25),
    organizationId: ids.orgB,
    type: FinancialTransactionType.EXPENSE,
    status: FinancialTransactionStatus.COMPLETED,
    category: FinancialTransactionCategory.SUPPLIES,
    amount: 160,
    concept: 'Tenant B materiales de oficina',
    occurredAt: '2026-08-12T12:00:00.000Z',
    paymentMethod: PaymentMethod.CASH,
    createdById: ids.ownerB,
  }),
  transaction({
    id: seedUuid(30000000, 26),
    organizationId: ids.orgB,
    type: FinancialTransactionType.REFUND,
    status: FinancialTransactionStatus.COMPLETED,
    category: FinancialTransactionCategory.SESSION,
    amount: 90,
    concept: 'Tenant B reembolso parcial',
    occurredAt: '2026-08-13T12:00:00.000Z',
    paymentMethod: PaymentMethod.TRANSFER,
    patientId: ids.patientB,
    appointmentId: ids.appointmentB,
    createdById: ids.ownerB,
  }),
] satisfies Prisma.FinancialTransactionCreateManyInput[];

const tenantAExpectedSummary = {
  incomeTotal: 7800,
  expenseTotal: 2370,
  adjustmentTotal: 250,
  refundTotal: 450,
  netTotal: 5230,
  transactionCount: 20,
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
  demographics: {
    phoneNumber: string | null;
    birthDate: string | null;
  } = {
    phoneNumber: '+526621230000',
    birthDate: '1990-01-01',
  },
) {
  return {
    id,
    organizationId,
    psychologistId,
    firstName,
    lastName,
    email,
    phoneNumber: demographics.phoneNumber,
    birthDate: demographics.birthDate
      ? new Date(`${demographics.birthDate}T00:00:00.000Z`)
      : null,
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
  sessionDate = '2026-04-01T10:00:00.000Z',
  content = 'Synthetic clinical note for local development only.',
) {
  return {
    id,
    organizationId,
    caseFileId,
    authorId,
    sessionDate: new Date(sessionDate),
    title,
    content: `${SEED_TAG} ${content}`,
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

  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_immutable;',
    );
  } catch (error) {
    // Trigger may not exist in initial migrations
  }

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

  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { organizationId: { in: organizationIds } },
        { userId: { in: userIds } },
      ],
    },
  });

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
    prisma.userBranchAccess.deleteMany({
      where: {
        OR: [
          { organizationId: { in: organizationIds } },
          { userId: { in: userIds } },
        ],
      },
    }),
    prisma.branch.deleteMany({
      where: {
        OR: [
          { organizationId: { in: organizationIds } },
        ],
      },
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
    prisma.subscription.deleteMany({
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

  try {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_immutable;',
    );
  } catch (error) {
    // Trigger may not exist in initial migrations
  }
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
  await seedCommercialCoreData(prisma, {
    orgA: ids.orgA,
    orgB: ids.orgB,
    orgSuspended: ids.orgSuspended,
  });
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

  await prisma.branch.createMany({ data: branches });
  await prisma.userBranchAccess.createMany({ data: userBranchAccesses });

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
  await seedAllStockInstruments(prisma);

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
