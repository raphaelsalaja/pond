import { formatForDisplay } from "@tanstack/react-hotkeys";

/**
 * Single source of truth for app shortcuts: hotkey effects register from this
 * map, menu builders derive their glyphs from it, and the cheat sheet renders
 * it, so bindings and displayed shortcuts cannot drift apart.
 */

export type ShortcutGroup =
  | "Navigate"
  | "View"
  | "Selection"
  | "Saves"
  | "Viewer"
  | "Tags";

export interface ShortcutDef {
  keys: string;
  label: string;
  group: ShortcutGroup;
}

export const SHORTCUTS = {
  "nav.library": { keys: "Mod+1", label: "Go to Library", group: "Navigate" },
  "nav.sources": { keys: "Mod+2", label: "Go to Sources", group: "Navigate" },
  "nav.analytics": {
    keys: "Mod+3",
    label: "Go to Analytics",
    group: "Navigate",
  },
  "nav.trash": { keys: "Mod+4", label: "Go to Trash", group: "Navigate" },
  "nav.back": { keys: "Mod+[", label: "Back", group: "Navigate" },
  "nav.forward": { keys: "Mod+]", label: "Forward", group: "Navigate" },
  "nav.scroll-top": {
    keys: "Mod+ArrowUp",
    label: "Scroll to Top",
    group: "Navigate",
  },
  "nav.scroll-bottom": {
    keys: "Mod+ArrowDown",
    label: "Scroll to Bottom",
    group: "Navigate",
  },
  "dock.ask": { keys: "Mod+K", label: "Ask Your Library", group: "Navigate" },
  "dock.search": { keys: "Mod+F", label: "Search", group: "Navigate" },
  "app.shortcuts": {
    keys: "Mod+/",
    label: "Keyboard Shortcuts",
    group: "Navigate",
  },

  "view.zoom-in": { keys: "Mod+=", label: "Zoom In", group: "View" },
  "view.zoom-out": { keys: "Mod+-", label: "Zoom Out", group: "View" },
  "view.zoom-reset": { keys: "Mod+0", label: "Reset Zoom", group: "View" },
  "view.layout-cycle": {
    keys: "Mod+Shift+L",
    label: "Cycle Layout",
    group: "View",
  },
  "view.inspector": { keys: "Mod+I", label: "Toggle Details", group: "View" },

  "grid.prev": {
    keys: "ArrowLeft",
    label: "Previous Save",
    group: "Selection",
  },
  "grid.next": { keys: "ArrowRight", label: "Next Save", group: "Selection" },
  "grid.extend-prev": {
    keys: "Shift+ArrowLeft",
    label: "Extend Selection Left",
    group: "Selection",
  },
  "grid.extend-next": {
    keys: "Shift+ArrowRight",
    label: "Extend Selection Right",
    group: "Selection",
  },
  "grid.open": { keys: "Enter", label: "Open Save", group: "Selection" },
  "grid.preview": { keys: "Space", label: "Open Save", group: "Selection" },
  "grid.select-all": {
    keys: "Mod+A",
    label: "Select All",
    group: "Selection",
  },
  "grid.clear": {
    keys: "Escape",
    label: "Clear Selection",
    group: "Selection",
  },
  "trash.empty": {
    keys: "Mod+Shift+Backspace",
    label: "Empty Trash",
    group: "Saves",
  },

  "save.open": { keys: "O", label: "Open with Default App", group: "Saves" },
  "save.copy-image": {
    keys: "C",
    label: "Copy Image or Video",
    group: "Saves",
  },
  "save.copy-url": { keys: "Mod+Shift+C", label: "Copy URL", group: "Saves" },
  "save.copy-tags": {
    keys: "Mod+Shift+T",
    label: "Copy Tags",
    group: "Saves",
  },
  "save.paste-tags": {
    keys: "Mod+Shift+V",
    label: "Paste Tags",
    group: "Saves",
  },
  "save.export": { keys: "Mod+E", label: "Export", group: "Saves" },
  "save.refresh": { keys: "R", label: "Refresh Details", group: "Saves" },
  "save.trash": { keys: "Backspace", label: "Move to Trash", group: "Saves" },
  "save.restore": {
    keys: "Backspace",
    label: "Restore from Trash",
    group: "Saves",
  },
  "save.delete-forever": {
    keys: "Mod+Backspace",
    label: "Delete Forever",
    group: "Saves",
  },

  "viewer.prev-save": {
    keys: "Mod+ArrowLeft",
    label: "Previous Save",
    group: "Viewer",
  },
  "viewer.next-save": {
    keys: "Mod+ArrowRight",
    label: "Next Save",
    group: "Viewer",
  },
  "viewer.copy-frame": {
    keys: "Shift+C",
    label: "Copy Current Frame",
    group: "Viewer",
  },
  "viewer.save-frame": {
    keys: "Shift+S",
    label: "Save Current Frame",
    group: "Viewer",
  },

  "tags.rename": { keys: "E", label: "Rename", group: "Tags" },
} as const satisfies Record<string, ShortcutDef>;

export type ShortcutId = keyof typeof SHORTCUTS;

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  "Navigate",
  "View",
  "Selection",
  "Saves",
  "Viewer",
  "Tags",
];

/** Glyph tokens for the menu renderer's `shortcut: string[]` display. */
export function shortcutGlyphs(id: ShortcutId): string[] {
  return formatForDisplay(SHORTCUTS[id].keys).split(/[\s+]+/);
}
