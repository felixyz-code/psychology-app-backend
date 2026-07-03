import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppointmentsModule } from './appointments/appointments.module';
import { AuthModule } from './auth/auth.module';
import { CaseFilesModule } from './case-files/case-files.module';
import { DocumentsModule } from './documents/documents.module';
import { FinancialTransactionsModule } from './financial-transactions/financial-transactions.module';
import { PatientsModule } from './patients/patients.module';
import { PrismaModule } from './prisma/prisma.module';
import { SessionNotesModule } from './session-notes/session-notes.module';

@Module({
  imports: [
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
  providers: [AppService],
})
export class AppModule {}
