import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma, UserRole } from '@prisma/client';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is not defined.');
}

const adapter = new PrismaPg(connectionString);
const prisma = new PrismaClient({ adapter });

const DEFAULT_PASSWORD = 'ChangeMe123!';

const ADMIN_USER_ID = '1b5d4d7c-b7e6-4d8b-9b3d-a3b12f1e1001';
const PSYCHOLOGIST_USER_ID = '1b5d4d7c-b7e6-4d8b-9b3d-a3b12f1e1002';

const demoPatients = [
  {
    id: '6c6afc58-fad1-4ddd-bf24-f58ce17baf01',
    firstName: 'Sofia',
    lastName: 'Ramirez',
    phoneNumber: '+526621110001',
    email: 'sofia.ramirez@psychology-app.local',
    birthDate: new Date('1998-04-12'),
  },
  {
    id: '2fd6b374-f76b-44d6-8f1c-5f9b5ee4c902',
    firstName: 'Carlos',
    lastName: 'Navarro',
    phoneNumber: '+526621110002',
    email: 'carlos.navarro@psychology-app.local',
    birthDate: new Date('1989-09-23'),
  },
  {
    id: 'f1c7480d-95f7-4d97-b3bd-c4d9678bd303',
    firstName: 'Mariana',
    lastName: 'Lopez',
    phoneNumber: '+526621110003',
    email: 'mariana.lopez@psychology-app.local',
    birthDate: new Date('1995-01-30'),
  },
];

async function upsertUser(params: {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
}) {
  return prisma.user.upsert({
    where: { email: params.email },
    update: {
      id: params.id,
      name: params.name,
      passwordHash: params.passwordHash,
      role: params.role,
    },
    create: {
      id: params.id,
      name: params.name,
      email: params.email,
      passwordHash: params.passwordHash,
      role: params.role,
    },
    select: {
      id: true,
      email: true,
    },
  });
}

async function upsertPatient(
  psychologistId: string,
  patient: (typeof demoPatients)[number],
) {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "patients" (
      "id",
      "psychologistId",
      "firstName",
      "lastName",
      "phoneNumber",
      "email",
      "birthDate",
      "updatedAt"
    )
    VALUES (
      ${patient.id},
      ${psychologistId},
      ${patient.firstName},
      ${patient.lastName},
      ${patient.phoneNumber},
      ${patient.email},
      ${patient.birthDate},
      NOW()
    )
    ON CONFLICT ("id")
    DO UPDATE SET
      "psychologistId" = EXCLUDED."psychologistId",
      "firstName" = EXCLUDED."firstName",
      "lastName" = EXCLUDED."lastName",
      "phoneNumber" = EXCLUDED."phoneNumber",
      "email" = EXCLUDED."email",
      "birthDate" = EXCLUDED."birthDate",
      "updatedAt" = NOW()
  `);
}

async function main() {
  const defaultPasswordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  const admin = await upsertUser({
    id: ADMIN_USER_ID,
    name: 'Enrique Felix',
    email: 'admin@psychology-app.local',
    passwordHash: defaultPasswordHash,
    role: UserRole.ADMIN,
  });

  const psychologist = await upsertUser({
    id: PSYCHOLOGIST_USER_ID,
    name: 'Demo Psychologist',
    email: 'psychologist@psychology-app.local',
    passwordHash: defaultPasswordHash,
    role: UserRole.PSYCHOLOGIST,
  });

  for (const patient of demoPatients) {
    await upsertPatient(psychologist.id, patient);
  }

  console.log('Seed completed successfully.');
  console.log(`Demo password: ${DEFAULT_PASSWORD}`);
  console.log(`Admin user: ${admin.email}`);
  console.log(`Psychologist user: ${psychologist.email}`);
  console.log(`Patients seeded: ${demoPatients.length}`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
