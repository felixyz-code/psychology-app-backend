import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { seedAllStockInstruments } from './stock-instruments-seed';

export async function runPermanentStockInstrumentsSeed(prismaClient?: PrismaClient) {
  const connectionString = process.env.DATABASE_URL;

  let prisma = prismaClient;
  let ownsClient = false;

  if (!prisma) {
    if (!connectionString) {
      throw new Error('DATABASE_URL is not defined in environment variables.');
    }
    const adapter = new PrismaPg(connectionString);
    prisma = new PrismaClient({ adapter });
    ownsClient = true;
  }

  console.log('[Seed] Invocando sembrado permanente e idempotente de instrumentos psicométricos stock...');

  try {
    const results = await seedAllStockInstruments(prisma);
    console.log('[Seed] Instrumentos psicométricos sembrados/actualizados correctamente:');
    console.log(` - PHQ-9 (ID: ${results.phq9.id}, Code: ${results.phq9.code})`);
    console.log(` - GAD-7 (ID: ${results.gad7.id}, Code: ${results.gad7.code})`);
    console.log(` - PSS-10 (ID: ${results.pss10.id}, Code: ${results.pss10.code})`);
    console.log(` - AUDIT-C (ID: ${results.auditc.id}, Code: ${results.auditc.code})`);
    console.log(` - RSES (ID: ${results.rses.id}, Code: ${results.rses.code})`);
    return results;
  } finally {
    if (ownsClient && prisma) {
      await prisma.$disconnect();
    }
  }
}

if (require.main === module) {
  runPermanentStockInstrumentsSeed()
    .then(() => {
      console.log('[Seed] Proceso de instrumentos psicométricos completado con éxito.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[Seed] Error al sembrar instrumentos psicométricos:', error);
      process.exit(1);
    });
}
