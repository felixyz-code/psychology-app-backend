import { Module } from '@nestjs/common';
import { AppConfigModule } from '../config/config.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { OpsController } from './ops.controller';
import { OrphanReconciliationService } from './orphan-reconciliation.service';

@Module({
  imports: [PrismaModule, AppConfigModule, AuditLogsModule],
  controllers: [OpsController],
  providers: [OrphanReconciliationService],
  exports: [OrphanReconciliationService],
})
export class OpsModule {}
