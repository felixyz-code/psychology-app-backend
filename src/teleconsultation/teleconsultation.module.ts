import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantContextModule } from '../tenant-context/tenant-context.module';
import { TeleconsultationController } from './teleconsultation.controller';
import { TeleconsultationPublicController } from './teleconsultation-public.controller';
import { TeleconsultationService } from './teleconsultation.service';

@Module({
  imports: [PrismaModule, AuthModule, TenantContextModule],
  controllers: [TeleconsultationController, TeleconsultationPublicController],
  providers: [TeleconsultationService],
  exports: [TeleconsultationService],
})
export class TeleconsultationModule {}
