import {
  EMAIL_IDENTITY_LOCALE,
  normalizeEmailIdentity,
  trimEmailPresentation,
} from './email-identity.util';

describe('email identity utility', () => {
  it('normalizes identity with trim and fixed locale lowercasing', () => {
    expect(normalizeEmailIdentity(' User@Example.com ')).toBe(
      'user@example.com',
    );
    expect(EMAIL_IDENTITY_LOCALE).toBe('en-US');
  });

  it('keeps the presentation email trimmed without rewriting casing', () => {
    expect(trimEmailPresentation(' User@Example.com ')).toBe(
      'User@Example.com',
    );
  });
});
