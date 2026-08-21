import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { InstrumentsController } from './instruments.controller';
import { InstrumentsService } from './instruments.service';
import { ScoringEngineService } from './scoring/scoring-engine.service';

@Module({
  imports: [PrismaModule],
  controllers: [InstrumentsController],
  providers: [InstrumentsService, ScoringEngineService],
  exports: [InstrumentsService, ScoringEngineService],
})
export class InstrumentsModule {}
