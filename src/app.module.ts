import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { CaseFilesModule } from './case-files/case-files.module';
import { ErrorEnvelopeFilter } from './common/error-envelope.filter';
import { HttpLoggingInterceptor } from './common/observability/http-logging.interceptor';
import { createPinoHttpConfig } from './common/observability/pino-logger.config';
import { RequestIdMiddleware } from './common/request-context/request-id.middleware';
import { AppConfigModule } from './config/config.module';
import { AppConfigService } from './config/configuration';
import { DocumentsModule } from './documents/documents.module';
import { FinancialTransactionsModule } from './financial-transactions/financial-transactions.module';
import { HealthModule } from './health/health.module';
import { PatientsModule } from './patients/patients.module';
import { PrismaModule } from './prisma/prisma.module';
import { SessionNotesModule } from './session-notes/session-notes.module';
import { TenantContextGuard } from './tenant-context/guards/tenant-context.guard';
import { TenantContextModule } from './tenant-context/tenant-context.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { OrganizationLogoAssetsModule } from './organization-logo-assets/organization-logo-assets.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { AuditInterceptor } from './audit-logs/interceptors/audit.interceptor';
import { PaefGovernanceModule } from './common/paef-governance';
import { OpsModule } from './ops/ops.module';
import { EntitlementsModule } from './entitlements/entitlements.module';
import { BillingModule } from './billing/billing.module';

@Module({
  imports: [
    AppConfigModule,
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: createPinoHttpConfig,
    }),
    PrismaModule,
    AuthModule,
    PatientsModule,
    CaseFilesModule,
    SessionNotesModule,
    DocumentsModule,
    AppointmentsModule,
    FinancialTransactionsModule,
    HealthModule,
    TenantContextModule,
    OrganizationsModule,
    OrganizationLogoAssetsModule,
    AuditLogsModule,
    OpsModule,
    EntitlementsModule,
    BillingModule,
    PaefGovernanceModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    RequestIdMiddleware,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: ErrorEnvelopeFilter,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: TenantContextGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
