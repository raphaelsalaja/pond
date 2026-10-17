import { normalizeHotkey } from "@tanstack/hotkeys";
import { describe, expect, it } from "vitest";
import type { ShortcutDef } from "./shortcuts";
import {
  bindingKeys,
  bindingSequence,
  chordGlyphs,
  platformGlyphs,
  resolveShortcuts,
  SHORTCUT_PLATFORM,
  SHORTCUTS,
  shortcutConflict,
  shortcutGlyphs,
} from "./shortcuts";

describe("shortcut registry", () => {
  it("leaves Tab available for keyboard focus navigation", () => {
    const shortcuts: readonly ShortcutDef[] = Object.values(SHORTCUTS);
    const tabShortcuts = shortcuts.filter(
      (shortcut) => shortcut.keys === "Tab",
    );

    expect(tabShortcuts).toEqual([]);
    expect(SHORTCUTS["view.sidebar"].keys).toBe("[");
  });

  it("uses the same labels as save actions", () => {
    expect(SHORTCUTS["save.open-url"].label).toBe("Open Original in Browser");
    expect(SHORTCUTS["save.add-tag"].label).toBe("Add Tags");
    expect(SHORTCUTS["save.refresh"].label).toBe("Refresh from Source");
  });
});

describe("shortcut binding access", () => {
  it("returns configured key bindings", () => {
    const bindings = resolveShortcuts({
      profile: "pond",
      overrides: { "save.add-tag": "Control+Shift+T" },
    });

    expect(bindingKeys(bindings, "save.add-tag")).toBe(
      normalizeHotkey("Control+Shift+T", SHORTCUT_PLATFORM),
    );
  });

  it("returns configured shortcut sequences", () => {
    const bindings = resolveShortcuts({ profile: "pond", overrides: {} });

    expect(bindingSequence(bindings, "nav.library")).toEqual(["G", "L"]);
  });
});

describe("chordGlyphs", () => {
  it("keeps command-comma as two keys", () => {
    const keys = chordGlyphs("Mod+,");
    expect(keys.length).toBeGreaterThanOrEqual(2);
    expect(keys.at(-1)).toBe(",");
    expect(keys[0]).not.toContain(",");
  });

  it("keeps other punctuation chords as two keys", () => {
    for (const [chord, key] of [
      ["Mod+/", "/"],
      ["Mod+=", "="],
      ["Mod+-", "-"],
      ["Mod+[", "["],
      ["Mod+]", "]"],
    ] as const) {
      const keys = chordGlyphs(chord);
      expect(keys.at(-1)).toBe(key);
      expect(keys[0]).not.toContain(key);
    }
  });

  it("leaves Escape as one token", () => {
    expect(chordGlyphs("Escape")).toEqual(["Esc"]);
  });
});

describe("shortcutGlyphs", () => {
  it("splits Settings into modifier then comma", () => {
    const keys = shortcutGlyphs("app.settings");
    expect(keys.at(-1)).toBe(",");
    expect(keys.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps Go to Settings as G then comma", () => {
    expect(shortcutGlyphs("nav.settings")).toEqual(["G", ","]);
  });
});

describe("shortcut profiles", () => {
  it("exposes the global summon command with a stable default in both profiles", () => {
    for (const profile of ["pond", "eagle"] as const) {
      const bindings = resolveShortcuts({
        profile,
        overrides: { "app.summon": "Control+Alt+F12" },
      });
      expect(bindings["app.summon"].keys).toBe(
        normalizeHotkey("Control+Alt+F12", SHORTCUT_PLATFORM),
      );
    }
  });

  it("moves layouts out of rating keys without changing Pond defaults", () => {
    const eagle = resolveShortcuts({ profile: "eagle", overrides: {} });
    expect(eagle["save.rate-4"].keys).toBe("4");
    expect(eagle["save.rate-next-4"].keys).toBe("Shift+4");
    expect(eagle["view.layout-grid"].keys).toBe("Alt+2");
    expect(eagle["save.add-tag"].keys).toBe("T");
    expect(eagle["save.copy-image"].keys).toBe("Mod+C");
    const pond = resolveShortcuts({ profile: "pond", overrides: {} });
    expect(pond["view.layout-grid"].keys).toBe("2");
    expect(pond["save.add-tag"].keys).toBe("A");
    expect(pond["save.rate-4"].keys).toBe("Alt+4");
  });

  it("applies valid persisted overrides and ignores invalid old bindings", () => {
    const bindings = resolveShortcuts({
      profile: "pond",
      overrides: {
        "save.add-tag": "Control+Shift+T",
        "save.rate-4": "DefinitelyNotAKey",
      },
    });
    expect(bindings["save.add-tag"].keys).toBe(
      normalizeHotkey("Control+Shift+T", SHORTCUT_PLATFORM),
    );
    expect(bindings["save.rate-4"].keys).toBe("Alt+4");
    expect(SHORTCUTS["save.add-tag"].keys).toBe("A");
  });

  it("keeps Mod portable while retaining explicit Control on macOS", () => {
    const bindings = resolveShortcuts({
      profile: "pond",
      overrides: { "save.add-tag": "Mod+Shift+T" },
    });
    expect(bindings["library.search"].keys).toBe("Mod+K");
    expect(bindings["save.add-tag"].keys).toBe("Mod+Shift+T");
    expect(normalizeHotkey("Control+K", SHORTCUT_PLATFORM)).toBe(
      SHORTCUT_PLATFORM === "mac" ? "Control+K" : "Mod+K",
    );
  });

  it("keeps library create and import chords unique", () => {
    const preferences = { profile: "pond" as const, overrides: {} };
    for (const id of [
      "library.new-folder",
      "library.new-tag",
      "library.new-tag-group",
      "library.new-note",
      "library.import-files",
      "library.import-folders",
      "library.import-links",
    ] as const) {
      expect(shortcutConflict(id, SHORTCUTS[id].keys, preferences)).toBeNull();
    }
  });

  it("detects collisions against the effective profile", () => {
    expect(
      shortcutConflict("save.add-tag", "4", {
        profile: "eagle",
        overrides: {},
      }),
    ).toBe("Rate 4 Stars");
    expect(
      shortcutConflict("save.add-tag", "T", {
        profile: "eagle",
        overrides: {},
      }),
    ).toBeNull();
  });
});

describe("platform glyphs", () => {
  it("keeps macOS glyphs and spells modifiers out elsewhere", () => {
    const glyphs = ["⌘", "⌥", "⇧", "K"];
    expect(platformGlyphs(glyphs, "mac")).toEqual(glyphs);
    expect(platformGlyphs(glyphs, "windows")).toEqual([
      "Ctrl",
      "Alt",
      "Shift",
      "K",
    ]);
  });
});
