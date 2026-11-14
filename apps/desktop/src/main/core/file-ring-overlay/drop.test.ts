import { describe, expect, it, vi } from "vitest";
import { dropIntoFolder, type OverlayDropDeps } from "./drop";

function deps(): OverlayDropDeps {
  return {
    hasFolder: vi.fn(async (id: string) => id === "moodboard"),
    saveIdFor: (path) => (path.startsWith("/library/") ? "save-1" : null),
    addSaves: vi.fn(async () => {}),
    importFiles: vi.fn(async (paths: string[]) => ({
      ids: paths.filter((path) => !path.endsWith(".broken")),
      failed: paths.filter((path) => path.endsWith(".broken")).length,
    })),
    quickAdd: vi.fn(async (url: string) => !url.includes("offline")),
  };
}

describe("overlay drops", () => {
  it("imports files from another app into the folder", async () => {
    const d = deps();
    const result = await dropIntoFolder(
      {
        kind: "files",
        folderId: "moodboard",
        paths: ["/Desktop/a.png", "/Desktop/b.broken"],
      },
      d,
    );
    expect(result).toEqual({
      ok: true,
      kind: "files",
      imported: 1,
      failed: 1,
    });
    expect(d.importFiles).toHaveBeenCalledWith(
      ["/Desktop/a.png", "/Desktop/b.broken"],
      "moodboard",
    );
    expect(d.addSaves).not.toHaveBeenCalled();
  });

  it("files Saves dragged out of the Library without importing them again", async () => {
    const d = deps();
    const result = await dropIntoFolder(
      {
        kind: "files",
        folderId: "moodboard",
        paths: ["/library/saves/1/a.png"],
      },
      d,
    );
    expect(result).toEqual({
      ok: true,
      kind: "files",
      imported: 1,
      failed: 0,
    });
    expect(d.addSaves).toHaveBeenCalledWith("moodboard", ["save-1"]);
    expect(d.importFiles).not.toHaveBeenCalled();
  });

  it("adds each link to the folder and counts the ones that fail", async () => {
    const d = deps();
    const result = await dropIntoFolder(
      {
        kind: "urls",
        folderId: "moodboard",
        urls: ["https://example.com", "https://offline.example"],
      },
      d,
    );
    expect(result).toEqual({ ok: true, kind: "urls", imported: 1, failed: 1 });
    expect(d.quickAdd).toHaveBeenCalledWith("https://example.com", "moodboard");
  });

  it("refuses a folder deleted while the ring was open", async () => {
    const d = deps();
    const result = await dropIntoFolder(
      { kind: "urls", folderId: "gone", urls: ["https://example.com"] },
      d,
    );
    expect(result).toEqual({ ok: false, reason: "folder_unavailable" });
    expect(d.quickAdd).not.toHaveBeenCalled();
  });
});
