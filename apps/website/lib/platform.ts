import { useSyncExternalStore } from "react";

export type Platform = "mac" | "windows";

/** The server render and every system without a build get the Mac download. */
const FALLBACK: Platform = "mac";

/** Chromium's User-Agent Client Hints; not in TypeScript's DOM types yet. */
type NavigatorWithHints = Navigator & {
  userAgentData?: { platform: string };
};

function detectPlatform(navigator: NavigatorWithHints): Platform {
  const name = navigator.userAgentData?.platform || navigator.userAgent;
  return /windows|win32|win64/i.test(name) ? "windows" : FALLBACK;
}

const subscribe = () => () => {};

export function usePlatform(): Platform {
  return useSyncExternalStore(
    subscribe,
    () => detectPlatform(window.navigator),
    () => FALLBACK,
  );
}
