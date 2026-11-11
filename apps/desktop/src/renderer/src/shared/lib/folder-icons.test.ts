import { FOLDER_ICON_IDS } from "@pond/schema/folder-presentation";
import { describe, expect, it } from "vitest";
import { FOLDER_ICONS } from "./folder-icons";

describe("folder icons", () => {
  it("draws every icon a folder can store", () => {
    expect(FOLDER_ICONS.map((icon) => icon.id).sort()).toEqual(
      [...FOLDER_ICON_IDS].sort(),
    );
  });

  it("gives each icon its own glyph and label", () => {
    expect(new Set(FOLDER_ICONS.map((icon) => icon.Icon)).size).toBe(
      FOLDER_ICONS.length,
    );
    expect(new Set(FOLDER_ICONS.map((icon) => icon.label)).size).toBe(
      FOLDER_ICONS.length,
    );
  });
});
