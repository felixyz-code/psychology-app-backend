import {
  ASCII_EMAIL_IDENTITY_PATTERN,
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

  it('trims non-space ASCII whitespace the same way the runtime helper expects', () => {
    expect(normalizeEmailIdentity('\tUser@Example.com\n')).toBe(
      'user@example.com',
    );
  });

  it('declares the supported ASCII email identity domain explicitly', () => {
    expect(ASCII_EMAIL_IDENTITY_PATTERN.test('user@example.com')).toBe(true);
    expect(ASCII_EMAIL_IDENTITY_PATTERN.test('josé@example.com')).toBe(false);
  });
});
