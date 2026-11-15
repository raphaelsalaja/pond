import {
  FOLDER_COLOR_IDS,
  FOLDER_ICON_IDS,
} from "@pond/schema/folder-presentation";
import { describe, expect, it } from "vitest";
import {
  FOLDER_ICONS,
  FOLDER_SWATCHES,
  folderColorCss,
  folderSwatchCss,
  searchFolderIcons,
} from "./folder-icons";

function ids(query: string): string[] {
  return searchFolderIcons(query).map((icon) => icon.id);
}

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

  it("gives every icon search keywords", () => {
    for (const icon of FOLDER_ICONS) expect(icon.keywords.trim()).not.toBe("");
  });
});

describe("searchFolderIcons", () => {
  it("lists every icon for an empty query", () => {
    expect(searchFolderIcons("  ")).toBe(FOLDER_ICONS);
  });

  it("matches keywords as well as names", () => {
    expect(ids("photos")).toEqual(["album"]);
    expect(ids("PHOTO")).toEqual(expect.arrayContaining(["album", "camera"]));
  });

  it("sorts name matches before keyword matches", () => {
    expect(ids("star")[0]).toBe("star");
    expect(ids("star").length).toBeGreaterThan(1);
  });

  it("requires every word to match", () => {
    expect(ids("photo camera")).toEqual(["camera"]);
    expect(ids("zzzz")).toEqual([]);
  });
});

describe("folder colors", () => {
  it("offers a swatch for every stored palette color", () => {
    expect(FOLDER_SWATCHES.flatMap((swatch) => swatch.id ?? [])).toEqual([
      ...FOLDER_COLOR_IDS,
    ]);
  });

  it("previews swatches and custom hex colors as picked", () => {
    expect(folderSwatchCss("pink")).toBe("var(--ds-pink-9)");
    expect(folderSwatchCss("#ab12cd")).toBe("#ab12cd");
    expect(folderSwatchCss("plum")).toBeUndefined();
    expect(folderSwatchCss(null)).toBeUndefined();
  });

  it("clamps custom colors to the theme's lightness band", () => {
    expect(folderColorCss("pink")).toBe("var(--ds-pink-9)");
    expect(folderColorCss("#ffffff")).toBe(
      "oklch(from #ffffff clamp(var(--folder-ink-min, 0), l, var(--folder-ink-max, 1)) c h)",
    );
  });
});
