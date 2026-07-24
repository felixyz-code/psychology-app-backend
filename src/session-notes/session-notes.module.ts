import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantContextModule } from '../tenant-context/tenant-context.module';
import { SessionNotesController } from './session-notes.controller';
import { SessionNotesService } from './session-notes.service';

@Module({
  imports: [PrismaModule, AuthModule, TenantContextModule],
  controllers: [SessionNotesController],
  providers: [SessionNotesService],
})
export class SessionNotesModule {}
