import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TemplateInterpolatorService } from './interpolator/template-interpolator.service';
import { NotificationTemplatesController } from './notification-templates.controller';
import { NotificationTemplatesService } from './notification-templates.service';

@Module({
  imports: [PrismaModule, BillingModule],
  controllers: [NotificationTemplatesController],
  providers: [TemplateInterpolatorService, NotificationTemplatesService],
  exports: [TemplateInterpolatorService, NotificationTemplatesService],
})
export class NotificationTemplatesModule {}
