import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentTenant } from '../../tenant-context/decorators/current-tenant.decorator';
import { SkipTenantContext } from '../../tenant-context/decorators/skip-tenant-context.decorator';
import { TenantRequired } from '../../tenant-context/decorators/tenant-required.decorator';
import type { TenantContext } from '../../tenant-context/tenant-context.types';
import { BillingService } from '../billing.service';
import {
  CheckoutSessionResponseDto,
  CreateCheckoutSessionDto,
} from '../dto/billing-checkout.dto';
import {
  CreatePortalSessionDto,
  PortalSessionResponseDto,
} from '../dto/billing-portal.dto';
import { SubscriptionOverviewResponseDto } from '../dto/subscription-overview.dto';
import { StripeBillingService } from '../services/stripe-billing.service';

@ApiTags('billing')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Authentication is required' })
@TenantRequired()
@Controller('billing')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly stripeBillingService: StripeBillingService,
  ) {}

  @Get('subscription')
  @ApiOperation({
    summary: 'Get current subscription details, plan quotas and real-time usage',
    description:
      'Retrieves the active organization subscription, quota limits and consolidated consumption metrics.',
  })
  @ApiOkResponse({
    type: SubscriptionOverviewResponseDto,
    description: 'Subscription overview successfully retrieved',
  })
  async getSubscriptionOverview(
    @CurrentTenant(true) tenant: TenantContext,
  ): Promise<SubscriptionOverviewResponseDto> {
    return this.billingService.getSubscriptionOverview(tenant.organizationId);
  }

  @Post('checkout-session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate a Stripe Checkout session URL',
    description:
      'Creates a checkout session for subscribing or upgrading the SaaS plan for the current organization.',
  })
  @ApiOkResponse({
    type: CheckoutSessionResponseDto,
    description: 'Checkout session URL successfully generated',
  })
  async createCheckoutSession(
    @CurrentTenant(true) tenant: TenantContext,
    @Body() dto: CreateCheckoutSessionDto,
  ): Promise<CheckoutSessionResponseDto> {
    return this.stripeBillingService.createCheckoutSession(
      tenant.organizationId,
      dto.priceId,
      dto.successUrl,
      dto.cancelUrl,
    );
  }

  @Post('portal-session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate a Stripe Customer Portal session URL',
    description:
      'Creates a Stripe self-service billing portal session to update payment methods, invoices or cancel subscription.',
  })
  @ApiOkResponse({
    type: PortalSessionResponseDto,
    description: 'Customer portal session URL successfully generated',
  })
  async createPortalSession(
    @CurrentTenant(true) tenant: TenantContext,
    @Body() dto: CreatePortalSessionDto,
  ): Promise<PortalSessionResponseDto> {
    return this.stripeBillingService.createCustomerPortalSession(
      tenant.organizationId,
      dto.returnUrl,
    );
  }

  @Post('webhook')
  @Public()
  @SkipTenantContext()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Public Stripe Webhook receiver',
    description:
      'Receives Stripe webhook notifications with cryptographic signature verification.',
  })
  @ApiOkResponse({
    description: 'Webhook event processed successfully',
  })
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const rawBody =
      req.rawBody ??
      (req.body ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body)) : '');

    return this.stripeBillingService.handleWebhookEvent(signature, rawBody);
  }
}
