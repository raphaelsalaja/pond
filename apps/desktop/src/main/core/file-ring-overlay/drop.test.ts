import { describe, expect, it } from "vitest";
import { dropIntoFolder } from "./drop";
import type { OverlayDropDeps } from "./drop";

function deps() {
  const addedSaves: Array<[string, Array<string>]> = [];
  const importedFiles: Array<[Array<string>, string]> = [];
  const quickAdds: Array<[string, string]> = [];
  const d: OverlayDropDeps = {
    hasFolder: async (id: string) => id === "moodboard",
    saveIdFor: (path) => (path.startsWith("/library/") ? "save-1" : null),
    addSaves: async (folderId: string, saveIds: Array<string>) => {
      addedSaves.push([folderId, saveIds]);
    },
    importFiles: async (paths: Array<string>, folderId: string) => {
      importedFiles.push([paths, folderId]);
      return {
        ids: paths.filter((path) => !path.endsWith(".broken")),
        failed: paths.filter((path) => path.endsWith(".broken")).length,
      };
    },
    quickAdd: async (url: string, folderId: string) => {
      quickAdds.push([url, folderId]);
      return !url.includes("offline");
    },
  };
  return { d, addedSaves, importedFiles, quickAdds };
}

describe("overlay drops", () => {
  it("imports files from another app into the folder", async () => {
    const { d, addedSaves, importedFiles } = deps();
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
    expect(importedFiles).toContainEqual([
      ["/Desktop/a.png", "/Desktop/b.broken"],
      "moodboard",
    ]);
    expect(addedSaves).toEqual([]);
  });

  it("files Saves dragged out of the Library without importing them again", async () => {
    const { d, addedSaves, importedFiles } = deps();
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
    expect(addedSaves).toContainEqual(["moodboard", ["save-1"]]);
    expect(importedFiles).toEqual([]);
  });

  it("adds each link to the folder and counts the ones that fail", async () => {
    const { d, quickAdds } = deps();
    const result = await dropIntoFolder(
      {
        kind: "urls",
        folderId: "moodboard",
        urls: ["https://example.com", "https://offline.example"],
      },
      d,
    );
    expect(result).toEqual({ ok: true, kind: "urls", imported: 1, failed: 1 });
    expect(quickAdds).toContainEqual(["https://example.com", "moodboard"]);
  });

  it("refuses a folder deleted while the ring was open", async () => {
    const { d, quickAdds } = deps();
    const result = await dropIntoFolder(
      { kind: "urls", folderId: "gone", urls: ["https://example.com"] },
      d,
    );
    expect(result).toEqual({ ok: false, reason: "folder_unavailable" });
    expect(quickAdds).toEqual([]);
  });
});
