import type { NormalizedTheme } from "@pond/schema/db";
import { nativeTheme } from "electron";
import { getPrefs } from "./core/prefs";

export async function resolveTheme(): Promise<NormalizedTheme | null> {
  try {
    const { resolveActiveTheme, normalizeTheme } =
      await import("@pond/schema/db");
    const prefs = await getPrefs();
    return normalizeTheme(
      resolveActiveTheme(prefs, nativeTheme.shouldUseDarkColors),
    );
  } catch {
    return null;
  }
}
