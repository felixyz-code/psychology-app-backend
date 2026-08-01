import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { AppConfigService } from '../../config/configuration';

@Injectable()
export class FreelancerBootstrapEnabledGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate() {
    if (!this.config.publicFreelancerBootstrapEnabled) {
      throw new NotFoundException();
    }

    return true;
  }
}
