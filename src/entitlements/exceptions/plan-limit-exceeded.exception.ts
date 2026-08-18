import { HttpException, HttpStatus } from '@nestjs/common';

export interface PlanLimitExceededDetails {
  quotaKey: string;
  limit: number;
  currentUsage: number;
}

export class PlanLimitExceededException extends HttpException {
  constructor(details: PlanLimitExceededDetails, customMessage?: string) {
    super(
      {
        statusCode: HttpStatus.FORBIDDEN,
        code: 'PLAN_LIMIT_EXCEEDED',
        message:
          customMessage ??
          `Limit reached for '${details.quotaKey}' on the current plan. Current usage: ${details.currentUsage}, Limit: ${details.limit}.`,
        details: {
          quotaKey: details.quotaKey,
          limit: details.limit,
          currentUsage: details.currentUsage,
        },
      },
      HttpStatus.FORBIDDEN,
    );
  }
}
