import { describe, expect, it, vi } from "vitest";
import {
  type BookmarkFile,
  type BookmarkImportDependencies,
  importBookmarkFile,
  parseBookmarkFile,
  parseChromiumBookmarks,
  parseNetscapeBookmarks,
} from "./bookmarks";

describe("parseNetscapeBookmarks", () => {
  it("reads http(s) links from a Netscape bookmark file", () => {
    const html = `
      <!DOCTYPE NETSCAPE-Bookmark-file-1>
      <DL>
        <DT><A HREF="https://example.com/one">One</A>
        <DT><A HREF="http://example.com/two">Two</A>
        <DT><A HREF="https://example.com/one">Duplicate</A>
        <DT><A HREF="javascript:void(0)">Skip</A>
        <DT><A HREF="file:///tmp/local">Skip file</A>
      </DL>
    `;
    expect(
      parseNetscapeBookmarks(html).bookmarks.map((bookmark) => bookmark.url),
    ).toEqual(["https://example.com/one", "http://example.com/two"]);
  });

  it("keeps folders and dates added, and treats the toolbar as a root", () => {
    const html = `
      <!DOCTYPE NETSCAPE-Bookmark-file-1>
      <DL><p>
        <DT><H3 ADD_DATE="1700000000" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
        <DL><p>
          <DT><A HREF="https://example.com/bar" ADD_DATE="1700000100">Bar</A>
          <DT><H3>Type &amp; Fonts</H3>
          <DL><p>
            <DT><A HREF="https://example.com/font?a=1&amp;b=2" ADD_DATE="1700000200">Font</A>
            <DT><H3>Serif</H3>
            <DL><p>
              <DT><A HREF="https://example.com/serif">Serif</A>
            </DL><p>
          </DL><p>
          <DT><H3>Color</H3>
          <DL><p>
            <DT><A HREF="https://example.com/font?a=1&amp;b=2" ADD_DATE="1600000000">Again</A>
          </DL><p>
        </DL><p>
        <DT><A HREF="https://example.com/root">Root</A>
      </DL><p>
    `;
    expect(parseNetscapeBookmarks(html)).toEqual({
      folders: [
        { id: "folder-0", name: "Type & Fonts", parentId: null, sortOrder: 0 },
        { id: "folder-1", name: "Serif", parentId: "folder-0", sortOrder: 0 },
        { id: "folder-2", name: "Color", parentId: null, sortOrder: 1 },
      ],
      bookmarks: [
        {
          url: "https://example.com/bar",
          addedAt: new Date(1_700_000_100_000),
          folderIds: [],
        },
        {
          url: "https://example.com/font?a=1&b=2",
          addedAt: new Date(1_600_000_000_000),
          folderIds: ["folder-0", "folder-2"],
        },
        {
          url: "https://example.com/serif",
          addedAt: null,
          folderIds: ["folder-1"],
        },
        { url: "https://example.com/root", addedAt: null, folderIds: [] },
      ],
    });
  });
});

describe("parseChromiumBookmarks", () => {
  const microsSince1601 = (ms: number) =>
    String((BigInt(ms) + 11_644_473_600_000n) * 1000n);

  it("walks every root and converts WebKit timestamps", () => {
    const json = JSON.stringify({
      checksum: "x",
      version: 1,
      roots: {
        bookmark_bar: {
          type: "folder",
          name: "Bookmarks bar",
          children: [
            {
              type: "url",
              name: "One",
              url: "https://example.com/one",
              date_added: microsSince1601(1_700_000_000_000),
            },
            {
              type: "folder",
              name: "Reading",
              children: [
                {
                  type: "url",
                  name: "Two",
                  url: "https://example.com/two",
                  date_added: "0",
                },
              ],
            },
          ],
        },
        other: {
          type: "folder",
          name: "Other bookmarks",
          children: [
            { type: "url", name: "Skip", url: "chrome://settings" },
            { type: "url", name: "Three", url: "https://example.com/three" },
          ],
        },
        synced: { type: "folder", name: "Mobile bookmarks", children: [] },
      },
    });
    expect(parseChromiumBookmarks(json)).toEqual({
      folders: [
        { id: "folder-0", name: "Reading", parentId: null, sortOrder: 0 },
      ],
      bookmarks: [
        {
          url: "https://example.com/one",
          addedAt: new Date(1_700_000_000_000),
          folderIds: [],
        },
        {
          url: "https://example.com/two",
          addedAt: null,
          folderIds: ["folder-0"],
        },
        { url: "https://example.com/three", addedAt: null, folderIds: [] },
      ],
    });
  });

  it("rejects JSON that is not a Chromium bookmark file", () => {
    expect(parseChromiumBookmarks("{")).toBeNull();
    expect(parseChromiumBookmarks('{"items":[]}')).toBeNull();
    expect(parseBookmarkFile('  {"roots":{}}')).toEqual({
      bookmarks: [],
      folders: [],
    });
  });
});

describe("importBookmarkFile", () => {
  function dependencies(existing: string[] = []) {
    let next = 0;
    return {
      enqueueLink: vi.fn(async (url: string) => ({
        id: `save-${next++}`,
        created: !existing.includes(url),
      })),
      persistImported: vi.fn(async () => {}),
      importFolders: vi.fn(
        async (folders: BookmarkFile["folders"]) =>
          new Map(folders.map((folder) => [folder.id, `pond-${folder.id}`])),
      ),
      addToFolder: vi.fn(async () => ({ ok: true as const })),
    } satisfies BookmarkImportDependencies;
  }

  const file: BookmarkFile = {
    folders: [
      { id: "design", name: "Design", parentId: null, sortOrder: 0 },
      { id: "type", name: "Type", parentId: "design", sortOrder: 0 },
      { id: "empty", name: "Empty", parentId: null, sortOrder: 1 },
    ],
    bookmarks: [
      {
        url: "https://example.com/new",
        addedAt: new Date(1_700_000_000_000),
        folderIds: ["type"],
      },
      {
        url: "https://example.com/old",
        addedAt: new Date(1_600_000_000_000),
        folderIds: ["empty"],
      },
      { url: "https://example.com/loose", addedAt: null, folderIds: [] },
    ],
  };

  it("marks, dates and files only the Saves it creates", async () => {
    const deps = dependencies(["https://example.com/old"]);
    await expect(importBookmarkFile(file, deps)).resolves.toEqual({
      ok: true,
      imported: 2,
      skipped: 1,
    });
    expect(deps.persistImported.mock.calls).toEqual([
      [
        "save-0",
        {
          importedFrom: "bookmarks",
          savedAt: new Date(1_700_000_000_000),
          createdAt: new Date(1_700_000_000_000),
        },
      ],
      ["save-2", { importedFrom: "bookmarks" }],
    ]);
    expect(deps.importFolders).toHaveBeenCalledExactlyOnceWith([
      file.folders[0],
      file.folders[1],
    ]);
    expect(deps.addToFolder).toHaveBeenCalledExactlyOnceWith("pond-type", [
      "save-0",
    ]);
  });

  it("records the origin the caller names", async () => {
    const deps = dependencies();
    await importBookmarkFile(
      {
        bookmarks: [
          { url: "https://example.com/a", addedAt: null, folderIds: [] },
        ],
        folders: [],
      },
      deps,
      "data-export",
    );
    expect(deps.persistImported).toHaveBeenCalledExactlyOnceWith("save-0", {
      importedFrom: "data-export",
    });
  });

  it("passes each bookmark's list kinds to the enqueue", async () => {
    const deps = dependencies();
    await importBookmarkFile(
      {
        bookmarks: [
          {
            url: "https://x.com/i/web/status/1",
            addedAt: null,
            folderIds: [],
            listKinds: ["liked"],
          },
          { url: "https://example.com/plain", addedAt: null, folderIds: [] },
        ],
        folders: [],
      },
      deps,
    );
    expect(deps.enqueueLink).toHaveBeenNthCalledWith(
      1,
      "https://x.com/i/web/status/1",
      ["liked"],
    );
    expect(deps.enqueueLink).toHaveBeenNthCalledWith(
      2,
      "https://example.com/plain",
      undefined,
    );
  });

  it("counts links that fail to queue as skipped", async () => {
    const deps = dependencies();
    deps.enqueueLink.mockRejectedValue(new Error("unsupported"));
    await expect(importBookmarkFile(file, deps)).resolves.toEqual({
      ok: true,
      imported: 0,
      skipped: 3,
    });
    expect(deps.importFolders).not.toHaveBeenCalled();
  });
});
