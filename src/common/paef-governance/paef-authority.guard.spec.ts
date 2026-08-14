import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PaefAuthorityGuard } from './paef-authority.guard';
import { EffectClass, HumanAuthorityDecision } from './paef.types';

describe('PaefAuthorityGuard', () => {
  let guard: PaefAuthorityGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new PaefAuthorityGuard(reflector);
  });

  const createMockContext = (
    headers: Record<string, any> = {},
    user?: any
  ): ExecutionContext => {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
          user,
        }),
      }),
    } as unknown as ExecutionContext;
  };

  it('should allow routes not marked as AUTHORITY_SENSITIVE', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(EffectClass.READ_ONLY);
    const context = createMockContext();

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should block AUTHORITY_SENSITIVE route when decision is absent and return 428 Precondition Required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === 'paef_effect_class') return EffectClass.AUTHORITY_SENSITIVE;
      return 'clinical:diagnostic-ai';
    });

    const context = createMockContext({});

    try {
      guard.canActivate(context);
      fail('Expected guard to throw HttpException');
    } catch (err: any) {
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(HttpStatus.PRECONDITION_REQUIRED);
      const response = err.getResponse();
      expect(response.paefAuthorityRequest).toBeDefined();
      expect(response.paefAuthorityRequest.requiredSubject).toBe('clinical:diagnostic-ai');
    }
  });

  it('should allow AUTHORITY_SENSITIVE route when valid HumanAuthorityDecision header is provided', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === 'paef_effect_class') return EffectClass.AUTHORITY_SENSITIVE;
      return 'clinical:diagnostic-ai';
    });

    const validDecision: HumanAuthorityDecision = {
      decisionId: 'DEC-001',
      authorityIdentity: 'lead.psychologist@clinic.org',
      governanceBasis: 'DSM-5 Clinical Protocol Approval',
      targetScope: 'clinical:diagnostic-ai',
      timestampUtc: new Date().toISOString(),
      isValid: true,
    };

    const context = createMockContext({
      'x-paef-authority-decision': JSON.stringify(validDecision),
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should block AUTHORITY_SENSITIVE route when decision is marked invalid', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === 'paef_effect_class') return EffectClass.AUTHORITY_SENSITIVE;
      return 'clinical:diagnostic-ai';
    });

    const invalidDecision: HumanAuthorityDecision = {
      decisionId: 'DEC-002',
      authorityIdentity: 'lead.psychologist@clinic.org',
      governanceBasis: 'Rejected due to contraindication',
      targetScope: 'clinical:diagnostic-ai',
      timestampUtc: new Date().toISOString(),
      isValid: false,
      rejectionReason: 'Clinical contraindication detected',
    };

    const context = createMockContext({
      'x-paef-authority-decision': JSON.stringify(invalidDecision),
    });

    try {
      guard.canActivate(context);
      fail('Expected guard to throw HttpException');
    } catch (err: any) {
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(HttpStatus.FORBIDDEN);
    }
  });
});
