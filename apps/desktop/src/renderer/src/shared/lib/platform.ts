import { SHORTCUT_PLATFORM } from "@shared/shortcuts";

/** navigator.platform is stable for the process lifetime; resolve the reveal label once. */
export const REVEAL_LABEL: string = (() => {
  if (!globalThis.navigator) return "Reveal in Finder";
  const p = navigator.platform?.toLowerCase() ?? "";
  if (p.includes("win")) return "Reveal in File Explorer";
  if (p.includes("linux")) return "Show in File Manager";
  return "Reveal in Finder";
})();

export const IS_MAC: boolean = SHORTCUT_PLATFORM === "mac";

/** The device noun used in settings copy. */
export const THIS_DEVICE: string = IS_MAC ? "this Mac" : "this computer";

/** The native share sheet exists only on macOS; main rejects saves.share elsewhere. */
export function canShareOn(platformName: string): boolean {
  const p = platformName.toLowerCase();
  return !p.includes("win") && !p.includes("linux");
}

export const CAN_SHARE: boolean = canShareOn(
  globalThis.navigator?.platform ?? "",
);

type Platform = "mac" | "other";

let platform: Platform | null = null;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const cb of listeners) cb();
}

function _ensure(): void {
  if (platform !== null || pending) return;
  pending = window.pond.appInfo().then((info) => {
    platform = info.platform === "darwin" ? "mac" : "other";
    pending = null;
    emit();
  });
}
