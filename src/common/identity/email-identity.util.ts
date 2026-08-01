export const EMAIL_IDENTITY_LOCALE = 'en-US';
export const ASCII_EMAIL_IDENTITY_PATTERN = /^[\u0021-\u007E]+$/;

export function normalizeEmailIdentity(email: string) {
  return email.trim().toLocaleLowerCase(EMAIL_IDENTITY_LOCALE);
}

export function trimEmailPresentation(email: string) {
  return email.trim();
}
