import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantContextModule } from '../tenant-context/tenant-context.module';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogService } from './audit-logs.service';
import { AuditInterceptor } from './interceptors/audit.interceptor';

@Module({
  imports: [PrismaModule, TenantContextModule],
  controllers: [AuditLogsController],
  providers: [AuditLogService, AuditInterceptor],
  exports: [AuditLogService, AuditInterceptor],
})
export class AuditLogsModule {}
