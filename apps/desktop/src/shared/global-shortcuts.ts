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
  "app.file-ring": {
    keys: "Mod+Shift+K",
    label: "Open File To Ring",
    group: "Global",
  },
} as const;

export type GlobalShortcutId = keyof typeof GLOBAL_SHORTCUTS;

export interface GlobalShortcutStatus {
  enabled: boolean;
  errors: string[];
}
