import { HttpException, HttpStatus } from '@nestjs/common';

export enum QuotaResource {
  THERAPISTS = 'THERAPISTS',
  BRANCHES = 'BRANCHES',
  NOTIFICATIONS = 'NOTIFICATIONS',
}

export interface QuotaExceededDetails {
  resource: QuotaResource | string;
  currentUsage: number;
  maxAllowed: number;
  currentTier: string;
  suggestedTier: string;
  message?: string;
}

export class QuotaExceededException extends HttpException {
  readonly resource: string;
  readonly currentUsage: number;
  readonly maxAllowed: number;
  readonly currentTier: string;
  readonly suggestedTier: string;

  constructor(details: QuotaExceededDetails) {
    const message =
      details.message ??
      `Quota exceeded for ${details.resource}. Current usage: ${details.currentUsage}, Maximum allowed: ${details.maxAllowed}. Upgrade to ${details.suggestedTier} to increase your quota limit.`;

    super(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        error: 'QUOTA_EXCEEDED',
        code: 'QUOTA_EXCEEDED',
        resource: details.resource,
        currentUsage: details.currentUsage,
        maxAllowed: details.maxAllowed,
        currentTier: details.currentTier,
        suggestedTier: details.suggestedTier,
        message,
      },
      HttpStatus.PAYMENT_REQUIRED,
    );

    this.resource = details.resource;
    this.currentUsage = details.currentUsage;
    this.maxAllowed = details.maxAllowed;
    this.currentTier = details.currentTier;
    this.suggestedTier = details.suggestedTier;
  }
}
