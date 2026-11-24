/** Pond ships a shortlist of Chromium locales, so dates and numbers follow the OS region rather than Chromium's fallback. */
export const SYSTEM_LOCALE_ARG = "--pond-locale=";

export function canonicalLocale(tag: string | undefined): string | undefined {
  if (!tag) {
    return undefined;
  }
  try {
    return Intl.getCanonicalLocales(tag)[0];
  } catch {
    return undefined;
  }
}
