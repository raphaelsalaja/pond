export const LAYOUT_CYCLE_SHORTCUT = {
  keys: "Mod+Shift+L",
  label: "Cycle Layout",
  group: "View",
} as const;

export const GLOBAL_SHORTCUTS = {
  "app.summon": {
    keys: "Mod+Shift+L",
    label: "Show Pond",
    group: "Global",
  },
  /** Ships unbound: any default chord would take keys from every other app until you choose one. */
  "app.file-ring": {
    label: "Open File To Ring",
    group: "Global",
  },
} as const;

export type GlobalShortcutId = keyof typeof GLOBAL_SHORTCUTS;

export function defaultGlobalKeys(id: GlobalShortcutId): string | undefined {
  const shortcut = GLOBAL_SHORTCUTS[id];
  return "keys" in shortcut ? shortcut.keys : undefined;
}

export interface GlobalShortcutStatus {
  enabled: boolean;
  errors: string[];
}
