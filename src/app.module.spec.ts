import { MODULE_METADATA } from '@nestjs/common/constants';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { AppModule } from './app.module';

type GlobalGuardProvider = {
  provide: typeof APP_GUARD;
  useClass: unknown;
};

describe('AppModule authorization guards', () => {
  it('registers JWT before roles as global guards', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      AppModule,
    ) as GlobalGuardProvider[];
    const globalGuards = providers.filter(
      (provider) => provider.provide === APP_GUARD,
    );

    expect(globalGuards).toEqual([
      { provide: APP_GUARD, useClass: JwtAuthGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
    ]);
  });
});
