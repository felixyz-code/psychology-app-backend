import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { CaseFilesModule } from './case-files/case-files.module';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
import { HttpLoggingInterceptor } from './common/observability/http-logging.interceptor';
import { RequestIdMiddleware } from './common/request-context/request-id.middleware';
import { AppConfigModule } from './config/config.module';
import { DocumentsModule } from './documents/documents.module';
import { FinancialTransactionsModule } from './financial-transactions/financial-transactions.module';
import { HealthModule } from './health/health.module';
import { PatientsModule } from './patients/patients.module';
import { PrismaModule } from './prisma/prisma.module';
import { SessionNotesModule } from './session-notes/session-notes.module';
import { TenantContextGuard } from './tenant-context/guards/tenant-context.guard';
import { TenantContextModule } from './tenant-context/tenant-context.module';
import { OrganizationsModule } from './organizations/organizations.module';

@Module({
  imports: [
    AppConfigModule,
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
      provide: APP_FILTER,
      useClass: PrismaExceptionFilter,
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
