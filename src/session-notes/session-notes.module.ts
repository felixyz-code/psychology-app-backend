import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SessionNotesController } from './session-notes.controller';
import { SessionNotesService } from './session-notes.service';

@Module({
  imports: [PrismaModule],
  controllers: [SessionNotesController],
  providers: [SessionNotesService],
})
export class SessionNotesModule {}
