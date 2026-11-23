/** Only the library window receives the OS region; other windows format with Chromium's locale. */
export const systemLocale: string | undefined =
  globalThis.window?.pond?.systemLocale;
