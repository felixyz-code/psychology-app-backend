import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantContextModule } from '../tenant-context/tenant-context.module';
import { ScheduleBlocksController } from './schedule-blocks.controller';
import { ScheduleBlocksService } from './schedule-blocks.service';

@Module({
  imports: [PrismaModule, TenantContextModule],
  controllers: [ScheduleBlocksController],
  providers: [ScheduleBlocksService],
  exports: [ScheduleBlocksService],
})
export class ScheduleBlocksModule {}
