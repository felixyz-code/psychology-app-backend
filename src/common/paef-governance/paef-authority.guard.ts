import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PAEF_EFFECT_CLASS_KEY, PAEF_TARGET_SCOPE_KEY } from './paef.decorator';
import {
  AuthorityRequest,
  EffectClass,
  HumanAuthorityDecision,
} from './paef.types';

@Injectable()
export class PaefAuthorityGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const effectClass = this.reflector.getAllAndOverride<EffectClass>(
      PAEF_EFFECT_CLASS_KEY,
      [context.getHandler(), context.getClass()]
    );

    const targetScope = this.reflector.getAllAndOverride<string>(
      PAEF_TARGET_SCOPE_KEY,
      [context.getHandler(), context.getClass()]
    );

    // If not annotated or not AUTHORITY_SENSITIVE, pass through
    if (!effectClass || effectClass !== EffectClass.AUTHORITY_SENSITIVE) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const headers = request.headers || {};
    const rawDecision = headers['x-paef-authority-decision'];

    let decision: HumanAuthorityDecision | null = null;
    if (rawDecision) {
      try {
        decision =
          typeof rawDecision === 'string'
            ? JSON.parse(rawDecision)
            : rawDecision;
      } catch {
        decision = null;
      }
    }

    // Check if user session has direct clinical authority role
    const user = request.user;
    if (!decision && user && (user.role === 'CLINICAL_LEAD' || user.role === 'ADMIN')) {
      decision = {
        decisionId: `SESSION-AUTH-${user.id || 'USER'}`,
        authorityIdentity: user.email || user.username || 'Clinical Lead',
        governanceBasis: 'Authenticated Human Clinical Lead Session',
        targetScope: targetScope || 'clinical',
        timestampUtc: new Date().toISOString(),
        isValid: true,
      };
    }

    // If decision is absent
    if (!decision) {
      const authRequest: AuthorityRequest = {
        requestId: `AUTH-REQ-${Date.now()}`,
        requiredSubject: targetScope || 'clinical:operation',
        requiredScope: targetScope || 'clinical:operation',
        requiredCharacteristic: 'Human Clinical Authority approval',
        blockingReason:
          'PAEF fail-closed: Operation is classified as AUTHORITY_SENSITIVE and requires explicit Human Authority decision.',
        runtimeVersion: '0.1.0',
      };

      throw new HttpException(
        {
          statusCode: HttpStatus.PRECONDITION_REQUIRED,
          error: 'Authority Decision Required',
          message:
            'PAEF Authority Gate: Human Authority approval required for this clinical mutation.',
          paefAuthorityRequest: authRequest,
        },
        HttpStatus.PRECONDITION_REQUIRED
      );
    }

    // If decision is invalid
    if (!decision.isValid) {
      throw new HttpException(
        {
          statusCode: HttpStatus.FORBIDDEN,
          error: 'Authority Decision Invalid',
          message: `PAEF Authority Gate: Supplied decision '${decision.decisionId}' is invalid: ${
            decision.rejectionReason || 'Rejected by policy'
          }`,
        },
        HttpStatus.FORBIDDEN
      );
    }

    // Attach validated decision to request context for provenance recording
    request['paefDecision'] = decision;
    return true;
  }
}
