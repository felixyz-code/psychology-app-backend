import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PaefAuditService } from './paef-audit.service';
import { PaefAuthorityGuard } from './paef-authority.guard';

@Global()
@Module({
  providers: [
    PaefAuditService,
    {
      provide: APP_GUARD,
      useClass: PaefAuthorityGuard,
    },
  ],
  exports: [PaefAuditService],
})
export class PaefGovernanceModule {}
