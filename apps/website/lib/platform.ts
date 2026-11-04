import { useSyncExternalStore } from "react";

export type Platform = "mac" | "windows" | "linux";

/** The server render and every system without a build get the Mac download. */
const FALLBACK: Platform = "mac";

/** Chromium's User-Agent Client Hints; not in TypeScript's DOM types yet. */
type NavigatorWithHints = Navigator & {
  userAgentData?: { platform: string };
};

function detectPlatform(navigator: NavigatorWithHints): Platform {
  const name = navigator.userAgentData?.platform || navigator.userAgent;
  if (/windows|win32|win64/i.test(name)) return "windows";
  if (/linux|x11/i.test(name)) return "linux";
  return FALLBACK;
}

const subscribe = () => () => {};

export function usePlatform(): Platform {
  return useSyncExternalStore(
    subscribe,
    () => detectPlatform(window.navigator),
    () => FALLBACK,
  );
}

export type Browser = "firefox" | "chromium";

export function useBrowser(): Browser {
  return useSyncExternalStore(
    subscribe,
    () =>
      /firefox\//i.test(window.navigator.userAgent) ? "firefox" : "chromium",
    () => "chromium",
  );
}
