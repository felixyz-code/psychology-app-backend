import { PrismaClient } from '@prisma/client';
import { seedPhq9StockInstrument } from './phq9-stock-seed';
import { seedGad7StockInstrument } from './gad7-stock-seed';
import { seedPss10StockInstrument } from './pss10-stock-seed';
import { seedAuditcStockInstrument } from './auditc-stock-seed';
import { seedRsesStockInstrument } from './rses-stock-seed';

export async function seedAllStockInstruments(prisma: PrismaClient) {
  const phq9 = await seedPhq9StockInstrument(prisma);
  const gad7 = await seedGad7StockInstrument(prisma);
  const pss10 = await seedPss10StockInstrument(prisma);
  const auditc = await seedAuditcStockInstrument(prisma);
  const rses = await seedRsesStockInstrument(prisma);

  return {
    phq9,
    gad7,
    pss10,
    auditc,
    rses,
  };
}
