import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { InstrumentsModule } from '../instruments/instruments.module';
import { AssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';

@Module({
  imports: [PrismaModule, InstrumentsModule],
  controllers: [AssessmentsController],
  providers: [AssessmentsService],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}
