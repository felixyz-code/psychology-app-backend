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
    headers: Record<string, string | undefined> = {},
    user?: { id?: string; email?: string; username?: string; role?: string },
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
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(EffectClass.READ_ONLY);
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
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const httpErr = err as HttpException;
      expect(httpErr.getStatus()).toBe(HttpStatus.PRECONDITION_REQUIRED);
      const response = httpErr.getResponse() as {
        paefAuthorityRequest: { requiredSubject: string };
      };
      expect(response.paefAuthorityRequest).toBeDefined();
      expect(response.paefAuthorityRequest.requiredSubject).toBe(
        'clinical:diagnostic-ai',
      );
    }
  });

  it('should allow AUTHORITY_SENSITIVE route when valid human authority header is present', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === 'paef_effect_class') return EffectClass.AUTHORITY_SENSITIVE;
      return 'clinical:diagnostic-ai';
    });

    const decision: HumanAuthorityDecision = {
      decisionId: 'AUTH-12345',
      authorityIdentity: 'dr.martinez@psychclinic.mx',
      governanceBasis: 'NOM-024 Clinical Verification Protocol Section 4.2',
      targetScope: 'clinical:diagnostic-ai',
      timestampUtc: '2026-08-14T08:00:00.000Z',
      isValid: true,
    };

    const context = createMockContext({
      'x-paef-authority-decision': JSON.stringify(decision),
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow direct clinical authority session from user role (CLINICAL_LEAD)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === 'paef_effect_class') return EffectClass.AUTHORITY_SENSITIVE;
      return 'clinical:treatment-modification';
    });

    const context = createMockContext(
      {},
      { id: 'usr-1', email: 'lead@clinic.test', role: 'CLINICAL_LEAD' },
    );

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
      fail('Expected guard to throw HttpException on invalid decision');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const httpErr = err as HttpException;
      expect(httpErr.getStatus()).toBe(HttpStatus.FORBIDDEN);
    }
  });
});
