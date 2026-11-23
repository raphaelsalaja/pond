import { canonicalLocale } from "@shared/system-locale";
import { app } from "electron";

let cached: string | undefined;

/** Electron only reports the OS region after `ready`; before that, formatting uses the default locale. */
export function systemLocale(): string | undefined {
  if (cached === undefined && app.isReady()) {
    cached = canonicalLocale(app.getSystemLocale()) ?? "";
  }
  return cached || undefined;
}
