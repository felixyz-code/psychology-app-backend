import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { CaseFilesModule } from './case-files/case-files.module';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
import { AppConfigModule } from './config/config.module';
import { DocumentsModule } from './documents/documents.module';
import { FinancialTransactionsModule } from './financial-transactions/financial-transactions.module';
import { PatientsModule } from './patients/patients.module';
import { PrismaModule } from './prisma/prisma.module';
import { SessionNotesModule } from './session-notes/session-notes.module';

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
  ],
  controllers: [AppController],
  providers: [
    AppService,
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
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
