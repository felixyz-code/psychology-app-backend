import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CaseFilesController } from './case-files.controller';
import { CaseFilesService } from './case-files.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CaseFilesController],
  providers: [CaseFilesService],
})
export class CaseFilesModule {}
