import { HttpException, HttpStatus } from '@nestjs/common';
import { PlanTier } from '@prisma/client';

export interface FeatureNotAvailableDetails {
  featureKey: string;
  currentTier?: PlanTier;
}

export class FeatureNotAvailableException extends HttpException {
  constructor(details: FeatureNotAvailableDetails, customMessage?: string) {
    super(
      {
        statusCode: HttpStatus.FORBIDDEN,
        code: 'FEATURE_NOT_AVAILABLE',
        message:
          customMessage ??
          `Feature '${details.featureKey}' is not included in the active subscription plan.`,
        details: {
          featureKey: details.featureKey,
          currentTier: details.currentTier ?? null,
        },
      },
      HttpStatus.FORBIDDEN,
    );
  }
}
