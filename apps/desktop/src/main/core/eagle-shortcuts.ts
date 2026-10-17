import { readFile } from "node:fs/promises";
import { normalizeHotkey } from "@tanstack/hotkeys";
import { z } from "zod";
import {
  isValidShortcut,
  SHORTCUT_PLATFORM,
  type ShortcutId,
  shortcutPlatformFromName,
} from "../../shared/shortcuts";

const EagleSettingsSchema = z.object({
  preferences: z.object({
    shortcuts: z.object({
      keybinds: z.record(z.string(), z.string()),
    }),
  }),
});

export type EagleShortcutDiscoveryStatus =
  | "available"
  | "missing"
  | "invalid"
  | "unreadable";

export interface EagleShortcutOverrides extends Record<string, string> {}

export interface EagleShortcutDiscovery {
  status: EagleShortcutDiscoveryStatus;
  overrides: EagleShortcutOverrides;
}

interface ShortcutMapping {
  target: ShortcutId;
  sources: readonly string[];
}

function shortcutMappings(platform: NodeJS.Platform): ShortcutMapping[] {
  const rename =
    platform === "darwin" ? "edit.rename.darwin" : "edit.rename.win32";
  const remove =
    platform === "darwin"
      ? "edit.remove.trash.darwin"
      : "edit.remove.trash.win32";
  return [
    {
      target: "app.summon",
      sources: ["global.show.eagle", "show.eagle"],
    },
    { target: "app.settings", sources: ["app.preferences"] },
    { target: "library.new-folder", sources: ["file.create.folder"] },
    { target: "library.import-folders", sources: ["file.import.folders"] },
    { target: "library.import-links", sources: ["file.import.links"] },
    {
      target: "library.search",
      sources: ["find.search.all", "find.search.current"],
    },
    {
      target: "save.assign-folders",
      sources: ["organize.folder.add"],
    },
    { target: "save.add-tag", sources: ["organize.tag.add"] },
    { target: "save.copy-tags", sources: ["organize.tag.copy"] },
    { target: "save.paste-tags", sources: ["organize.tag.paste"] },
    { target: "save.export", sources: ["file.export.item.computer"] },
    { target: "save.rename", sources: [rename] },
    { target: "save.open", sources: ["view.file.opendefault"] },
    { target: "save.open-url", sources: ["view.file.openlink"] },
    { target: "save.reveal", sources: ["view.file.openfinder"] },
    { target: "save.trash", sources: [remove] },
    { target: "save.rate-0", sources: ["organize.rating.0"] },
    { target: "save.rate-1", sources: ["organize.rating.1"] },
    { target: "save.rate-2", sources: ["organize.rating.2"] },
    { target: "save.rate-3", sources: ["organize.rating.3"] },
    { target: "save.rate-4", sources: ["organize.rating.4"] },
    { target: "save.rate-5", sources: ["organize.rating.5"] },
    { target: "view.layout-grid", sources: ["view.layout.grid"] },
    {
      target: "view.layout-justified",
      sources: ["view.layout.justified"],
    },
    {
      target: "view.layout-waterfall",
      sources: ["view.layout.waterfall"],
    },
    { target: "view.layout-list", sources: ["view.layout.list"] },
    { target: "view.sidebar", sources: ["view.toggle.sidebar"] },
    { target: "view.grayscale", sources: ["view.grayscale"] },
    { target: "nav.scroll-top", sources: ["view.scroll.home"] },
    { target: "nav.scroll-bottom", sources: ["view.scroll.end"] },
    { target: "viewer.zoom-fit", sources: ["view.zoom.fit"] },
    { target: "viewer.actual-size", sources: ["view.zoom.actual"] },
    {
      target: "viewer.play-pause",
      sources: ["player.playAndPause"],
    },
    { target: "viewer.frame-prev", sources: ["player.prev1frame"] },
    { target: "viewer.frame-next", sources: ["player.next1frame"] },
    {
      target: "viewer.frame-prev-ten",
      sources: ["player.prev10frame"],
    },
    {
      target: "viewer.frame-next-ten",
      sources: ["player.next10frame"],
    },
    {
      target: "viewer.seek-back",
      sources: ["player.step.backward"],
    },
    {
      target: "viewer.seek-forward",
      sources: ["player.step.forward"],
    },
    {
      target: "viewer.speed-up",
      sources: ["player.speed.up"],
    },
    {
      target: "viewer.speed-down",
      sources: ["player.speed.down"],
    },
    {
      target: "viewer.volume-up",
      sources: ["player.volume.increase"],
    },
    {
      target: "viewer.volume-down",
      sources: ["player.volume.decrease"],
    },
    {
      target: "viewer.copy-frame",
      sources: ["player.thumbnail.copy"],
    },
    {
      target: "viewer.save-frame",
      sources: ["player.thumbnail.save"],
    },
  ];
}

function normalizeEagleKey(value: string): string {
  switch (value.toLowerCase()) {
    case "down":
      return "ArrowDown";
    case "esc":
      return "Escape";
    case "left":
      return "ArrowLeft";
    case "return":
      return "Enter";
    case "right":
      return "ArrowRight";
    case "up":
      return "ArrowUp";
    default:
      return value;
  }
}

export function normalizeEagleShortcut(
  value: string,
  platform = SHORTCUT_PLATFORM,
): string | null {
  const parts = value
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const normalized = parts.map((part, index) => {
    const lower = part.toLowerCase();
    if (index < parts.length - 1) {
      if (lower === "command" || lower === "cmd") return "Mod";
      if (lower === "option") return "Alt";
      if (lower === "ctrl") return "Control";
      if (lower === "shift") return "Shift";
      if (lower === "control") return "Control";
      return part;
    }
    return normalizeEagleKey(part);
  });
  const shortcut = normalized.join("+");
  if (!isValidShortcut(shortcut)) return null;
  return normalizeHotkey(shortcut, platform);
}

export function mapEagleShortcuts(
  keybinds: Readonly<Record<string, string>>,
  platform: NodeJS.Platform = process.platform,
): EagleShortcutOverrides {
  const overrides: EagleShortcutOverrides = {};
  for (const mapping of shortcutMappings(platform)) {
    for (const source of mapping.sources) {
      const value = keybinds[source]?.trim();
      if (!value) continue;
      const shortcut = normalizeEagleShortcut(
        value,
        shortcutPlatformFromName(platform),
      );
      if (shortcut) overrides[mapping.target] = shortcut;
      break;
    }
  }
  return overrides;
}

export function parseEagleShortcuts(
  text: string,
  platform: NodeJS.Platform = process.platform,
): EagleShortcutDiscovery {
  let parsed: z.infer<typeof EagleSettingsSchema>;
  try {
    const result = EagleSettingsSchema.safeParse(JSON.parse(text));
    if (!result.success) return { status: "invalid", overrides: {} };
    parsed = result.data;
  } catch {
    return { status: "invalid", overrides: {} };
  }
  return {
    status: "available",
    overrides: mapEagleShortcuts(
      parsed.preferences.shortcuts.keybinds,
      platform,
    ),
  };
}

function errnoCode(cause: unknown): string | null {
  return cause instanceof Error && "code" in cause ? String(cause.code) : null;
}

export async function readEagleShortcuts(
  path: string,
  platform: NodeJS.Platform = process.platform,
): Promise<EagleShortcutDiscovery> {
  try {
    return parseEagleShortcuts(await readFile(path, "utf8"), platform);
  } catch (cause) {
    return {
      status: errnoCode(cause) === "ENOENT" ? "missing" : "unreadable",
      overrides: {},
    };
  }
}
