import { systemPreferences } from "electron";

/** Tahoe otherwise draws system glyphs on role items and injected Edit extras. */
export function disableMenuActionImages(): void {
  if (process.platform !== "darwin") return;
  systemPreferences.registerDefaults({ NSMenuEnableActionImages: false });
  systemPreferences.setUserDefault(
    "NSMenuEnableActionImages",
    "boolean",
    false,
  );
}
