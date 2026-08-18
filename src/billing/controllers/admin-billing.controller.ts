import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuditLog } from '../../audit-logs/decorators/audit-log.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { SkipTenantContext } from '../../tenant-context/decorators/skip-tenant-context.decorator';
import { BillingService } from '../billing.service';
import { ExtendTrialDto } from '../dto/extend-trial.dto';
import { ManualTransitionDto } from '../dto/manual-transition.dto';
import { PlanOverrideDto } from '../dto/plan-override.dto';

@ApiTags('admin-billing')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Authentication is required' })
@ApiForbiddenResponse({ description: 'ADMIN role is required' })
@SkipTenantContext()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@Controller('admin/billing')
export class AdminBillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('manual-transition')
  @HttpCode(HttpStatus.OK)
  @AuditLog({
    action: 'ADMIN_BILLING_OVERRIDE',
    resourceType: 'Subscription',
  })
  @ApiOperation({
    summary: 'Manually force a subscription state transition',
    description:
      'Strictly requires global ADMIN role. Bypasses tenant context. Changes subscription status and stamps audit timestamps.',
  })
  @ApiOkResponse({
    description: 'Subscription status successfully transitioned',
  })
  manualTransition(@Body() dto: ManualTransitionDto) {
    return this.billingService.manualTransition(
      dto.subscriptionId,
      dto.status,
      dto.reason,
    );
  }

  @Post('extend-trial')
  @HttpCode(HttpStatus.OK)
  @AuditLog({
    action: 'ADMIN_BILLING_OVERRIDE',
    resourceType: 'Subscription',
  })
  @ApiOperation({
    summary: 'Extend the trial period of a subscription',
    description:
      'Strictly requires global ADMIN role. Bypasses tenant context. Extends trial period by the specified number of days.',
  })
  @ApiOkResponse({
    description: 'Subscription trial period successfully extended',
  })
  extendTrial(@Body() dto: ExtendTrialDto) {
    return this.billingService.extendTrial(dto.subscriptionId, dto.daysToAdd);
  }

  @Patch('plan-override')
  @HttpCode(HttpStatus.OK)
  @AuditLog({
    action: 'ADMIN_BILLING_OVERRIDE',
    resourceType: 'Subscription',
  })
  @ApiOperation({
    summary: 'Force a subscription plan change',
    description:
      'Strictly requires global ADMIN role. Bypasses tenant context. Overrides subscription plan directly.',
  })
  @ApiOkResponse({
    description: 'Subscription plan successfully overridden',
  })
  planOverride(@Body() dto: PlanOverrideDto) {
    return this.billingService.planOverride(
      dto.subscriptionId,
      dto.newPlanCode,
    );
  }
}
