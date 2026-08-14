export interface BillingCustomerResult {
  externalCustomerId: string;
}

export interface BillingSubscriptionResult {
  externalSubscriptionId: string;
  status: string;
  currentPeriodEndsAt: Date;
}

export interface ChangePlanResult {
  status: string;
  currentPeriodEndsAt: Date;
}

export interface CancelSubscriptionResult {
  status: string;
  canceledAt: Date;
}

export interface BillingProvider {
  createCustomer(
    organizationId: string,
    email: string,
    name: string,
  ): Promise<BillingCustomerResult>;

  createSubscription(
    organizationId: string,
    planCode: string,
    externalCustomerId?: string,
  ): Promise<BillingSubscriptionResult>;

  changePlan(
    externalSubscriptionId: string,
    newPlanCode: string,
  ): Promise<ChangePlanResult>;

  cancelSubscription(
    externalSubscriptionId: string,
    reason?: string,
  ): Promise<CancelSubscriptionResult>;
}
