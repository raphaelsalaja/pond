import { describe, expect, it, vi } from "vitest";
import { TOAST_TIMEOUT_MS } from "@/shared/lib/toast";
import {
  canImportDrop,
  importToast,
  showImportedAction,
} from "./import-feedback";

describe("canImportDrop", () => {
  it("accepts files, links and text from another app", () => {
    expect(canImportDrop(["Files"])).toBe(true);
    expect(canImportDrop(["text/uri-list", "text/html"])).toBe(true);
    expect(canImportDrop(["text/plain"])).toBe(true);
  });

  it("ignores drags that carry none of them", () => {
    expect(canImportDrop([])).toBe(false);
    expect(canImportDrop(["application/x-pond-save"])).toBe(false);
  });
});

describe("importToast", () => {
  it("keeps the Library copy when no folder is chosen", () => {
    expect(importToast({ kind: "files", imported: 1, failed: 0 })).toEqual({
      title: "Saved to Pond",
    });
    expect(importToast({ kind: "urls", imported: 2, failed: 0 })).toEqual({
      title: "Downloading 2 links",
    });
  });

  it("names the folder the import went into", () => {
    const folder = { folderName: "Moodboard", failed: 0 };
    expect(importToast({ kind: "files", imported: 3, ...folder })).toEqual({
      title: 'Saved 3 items to "Moodboard"',
    });
    expect(importToast({ kind: "urls", imported: 1, ...folder })).toEqual({
      title: 'Downloading to "Moodboard"',
    });
  });

  it("reports the part of an import that failed", () => {
    expect(importToast({ kind: "files", imported: 2, failed: 1 })).toEqual({
      title: "Saved 2 items to Pond",
      description: "1 file couldn't be imported.",
    });
  });

  it("says what to check when nothing imported", () => {
    expect(
      importToast({
        kind: "urls",
        imported: 0,
        failed: 2,
        folderName: "Moodboard",
      }),
    ).toEqual({
      title: 'Couldn\'t save to "Moodboard"',
      description: "Check that the link opens in a browser, then try again.",
    });
  });

  it("stays quiet when an import was cancelled", () => {
    expect(importToast({ kind: "files", imported: 0, failed: 0 })).toBeNull();
  });
});

describe("showImportedAction", () => {
  it("shows exactly the Saves the import returned", () => {
    const show = vi.fn();
    const { action, timeout } = showImportedAction(["a", "b"], show);
    expect(action?.label).toBe("Show in Library");
    expect(timeout).toBeGreaterThan(TOAST_TIMEOUT_MS);
    action?.onClick();
    expect(show).toHaveBeenCalledExactlyOnceWith(["a", "b"]);
  });

  it("offers nothing when the import returned no Saves", () => {
    const show = vi.fn();
    expect(showImportedAction([], show)).toEqual({});
    expect(show).not.toHaveBeenCalled();
  });
});
