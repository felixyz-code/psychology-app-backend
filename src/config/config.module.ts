import { Global, Module } from '@nestjs/common';
import { AppConfigService } from './configuration';

@Global()
@Module({
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
