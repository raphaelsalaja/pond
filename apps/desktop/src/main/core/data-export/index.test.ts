import type { Source } from "@pond/schema/db";
import { describe, expect, it } from "vitest";
import type { BookmarkFile } from "../bookmarks";
import { entriesToBookmarkFile, importDataExport } from "./index";
import type { ExportReader } from "./reader";

function memoryReader(files: Record<string, string>) {
  const state = { closed: false };
  const reader: ExportReader = {
    paths: Object.keys(files),
    readText: async (path) => {
      const text = files[path];
      if (text === undefined) {
        throw new Error("missing");
      }
      return text;
    },
    close: async () => {
      state.closed = true;
    },
  };
  return { reader, state };
}

function importFileRecorder() {
  const imported: Array<BookmarkFile> = [];
  return {
    imported,
    importFile: async (file: BookmarkFile) => {
      imported.push(file);
      return {
        ok: true as const,
        imported: file.bookmarks.length,
        skipped: 0,
      };
    },
  };
}

describe("entriesToBookmarkFile", () => {
  it("makes one flat folder per name and keeps the earliest date per URL", () => {
    const file = entriesToBookmarkFile([
      {
        url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
        listKind: "saved",
        savedAt: new Date(2),
        folder: "Refs",
      },
      {
        url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
        listKind: "liked",
        savedAt: new Date(1),
      },
    ]);
    expect(file.folders).toEqual([
      { id: "folder-0", name: "Refs", parentId: null, sortOrder: 0 },
    ]);
    expect(file.bookmarks).toEqual([
      {
        url: "https://www.youtube.com/watch?v=aaaaaaaaaaa",
        addedAt: new Date(1),
        folderIds: ["folder-0"],
        listKinds: ["liked", "saved"],
      },
    ]);
  });
});

describe("importDataExport", () => {
  it("detects platforms, imports, and reports Sources you haven't connected", async () => {
    const { reader, state } = memoryReader({
      "data/like.js": 'window.YTD.like.part0 = [{"like":{"tweetId":"1"}}]',
      "data/tweets.js": "ignored",
      "saved_posts.csv":
        "id,permalink\nab1,https://www.reddit.com/r/x/comments/ab1/t/\n",
    });
    const { imported, importFile } = importFileRecorder();
    const result = await importDataExport("/x.zip", {
      open: async () => reader,
      importFile,
      connectedSources: async () => new Set<Source>(["reddit"]),
    });
    expect(result).toEqual({
      ok: true,
      imported: 2,
      skipped: 0,
      platforms: ["X", "Reddit"],
      connect: ["twitter"],
    });
    expect(imported).toHaveLength(1);
    expect(state.closed).toBe(true);
  });

  it("doesn't ask you to connect YouTube or Reddit", async () => {
    const { reader } = memoryReader({
      "saved_posts.csv":
        "id,permalink\nab1,https://www.reddit.com/r/x/comments/ab1/t/\n",
    });
    const result = await importDataExport("/x.zip", {
      open: async () => reader,
      importFile: importFileRecorder().importFile,
      connectedSources: async () => new Set<Source>(),
    });
    expect(result).toMatchObject({ ok: true, connect: [] });
  });

  it("fails clearly when nothing in the archive is readable", async () => {
    const { reader, state } = memoryReader({ "readme.txt": "hi" });
    const { imported, importFile } = importFileRecorder();
    const result = await importDataExport("/x.zip", {
      open: async () => reader,
      importFile,
      connectedSources: async () => new Set<Source>(),
    });
    expect(result.ok).toBe(false);
    expect(imported).toEqual([]);
    expect(state.closed).toBe(true);
  });

  it("fails clearly when the archive can't be opened", async () => {
    const result = await importDataExport("/broken.zip", {
      open: async () => {
        throw new Error("invalid zip");
      },
      importFile: importFileRecorder().importFile,
      connectedSources: async () => new Set<Source>(),
    });
    expect(result.ok).toBe(false);
  });
});
