export const EMAIL_IDENTITY_LOCALE = 'en-US';

export function normalizeEmailIdentity(email: string) {
  return email.trim().toLocaleLowerCase(EMAIL_IDENTITY_LOCALE);
}

export function trimEmailPresentation(email: string) {
  return email.trim();
}
