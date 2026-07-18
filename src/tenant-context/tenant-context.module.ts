import { Module } from '@nestjs/common';
import { RequestContextService } from '../common/request-context/request-context.service';
import { TenantContextGuard } from './guards/tenant-context.guard';
import { TenantResolverService } from './tenant-resolver.service';

@Module({
  providers: [TenantResolverService, TenantContextGuard, RequestContextService],
  exports: [TenantResolverService, TenantContextGuard, RequestContextService],
})
export class TenantContextModule {}
