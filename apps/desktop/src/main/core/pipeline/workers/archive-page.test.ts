import { PrefsSchema } from "@pond/schema/db";
import type { Save, SaveFile, Source } from "@pond/schema/db";
import { storedAsRawJson } from "@pond/schema/raw-schema";
import { describe, expect, it } from "vitest";
import type { WriteFileArgs } from "./apply";
import { hasWarcArchive, runArchivePage } from "./archive-page";
import type { ArchiveScope } from "./archive-page";

const preview: SaveFile = {
  kind: "image",
  path: "preview.jpg",
  sha256: "abc",
  size: 4,
};

type Crawl = {
  pages: Array<{ url: string; title: string }>;
  warcBytes: Buffer;
  authWalled: boolean;
};

function setup(
  autoArchive: boolean,
  origin: { source: Source; url: string } = {
    source: "web",
    url: "https://example.com/notes",
  },
  crawl?: Crawl,
) {
  const save = {
    ...origin,
    title: "Notes",
    description: "A short page",
    mediaUrl: "https://example.com/preview.jpg",
    files: [preview],
    /** SAFETY: null is a valid `rawJson`; the assertion only widens the literal so tests can assign a document capture. */
    rawJson: null as Save["rawJson"],
  };
  const crawls: Array<[URL, ArchiveScope]> = [];
  const calls = { autoArchive: 0, crawls, persists: 0 };
  const runtime = {
    readSave: async () => save,
    autoArchive: async () => {
      calls.autoArchive += 1;
      return autoArchive;
    },
    crawlSite: async (rootUrl: URL, scope: ArchiveScope) => {
      calls.crawls.push([rootUrl, scope]);
      return (
        crawl ?? {
          pages: [{ url: save.url, title: save.title }],
          warcBytes: Buffer.from("warc"),
          authWalled: false,
        }
      );
    },
    persistArchive: async (_saveId: string, files: Array<WriteFileArgs>) => {
      calls.persists += 1;
      save.files = [
        ...save.files,
        ...files.map((file) => ({
          kind: file.kind,
          path: file.filename,
          sha256: "archived",
          size: file.bytes?.byteLength ?? 0,
        })),
      ];
    },
  };
  return { save, runtime, calls };
}

const ctx = { signal: new AbortController().signal };

describe("archive_page automatic archive", () => {
  it("defaults to archiving so existing libraries keep today's behavior", () => {
    expect(PrefsSchema.parse({}).storage.autoArchive).toBe(true);
    expect(
      PrefsSchema.parse({ storage: { guardsEnabled: true } }).storage
        .autoArchive,
    ).toBe(true);
    expect(
      PrefsSchema.parse({ storage: { autoArchive: false } }).storage
        .autoArchive,
    ).toBe(false);
  });

  it("writes an archive and keeps the title, description, and preview when archiving is on", async () => {
    const { save, runtime, calls } = setup(true);

    await runArchivePage("save-1", {}, ctx, runtime);

    expect(calls.autoArchive).toBeGreaterThan(0);
    expect(calls.crawls).toHaveLength(1);
    expect(calls.persists).toBe(1);
    expect(hasWarcArchive(save.files)).toBe(true);
    expect(save.files.map((file) => file.path)).toContain("preview.jpg");
    expect(save).toMatchObject({
      title: "Notes",
      description: "A short page",
      mediaUrl: "https://example.com/preview.jpg",
    });
  });

  it("skips the browser crawl for a converted text document", async () => {
    const { save, runtime, calls } = setup(true);
    save.rawJson = storedAsRawJson({
      capture: {
        id: save.url,
        source: "web",
        url: save.url,
        extras: { textDocument: true },
      },
    });

    await runArchivePage("save-1", {}, ctx, runtime);

    expect(calls.crawls).toEqual([]);
    expect(calls.persists).toBe(0);
  });

  it("finishes the save without an archive when the page sits behind a login wall", async () => {
    const { save, runtime, calls } = setup(true, undefined, {
      pages: [],
      warcBytes: Buffer.alloc(0),
      authWalled: true,
    });

    await runArchivePage("save-1", {}, ctx, runtime);

    expect(calls.persists).toBe(0);
    expect(hasWarcArchive(save.files)).toBe(false);
    expect(save.files).toEqual([preview]);
  });

  it("retries when a crawl captures no page and no login wall explains it", async () => {
    const { runtime, calls } = setup(true, undefined, {
      pages: [],
      warcBytes: Buffer.alloc(0),
      authWalled: false,
    });

    await expect(runArchivePage("save-1", {}, ctx, runtime)).rejects.toThrow(
      "no pages captured",
    );
    expect(calls.persists).toBe(0);
  });

  it("keeps metadata only and writes no archive when automatic archiving is off", async () => {
    const { save, runtime, calls } = setup(false);

    await runArchivePage("save-1", {}, ctx, runtime);

    expect(calls.autoArchive).toBeGreaterThan(0);
    expect(calls.crawls).toEqual([]);
    expect(calls.persists).toBe(0);
    expect(hasWarcArchive(save.files)).toBe(false);
    expect(save.files).toEqual([preview]);
    expect(save).toMatchObject({
      title: "Notes",
      description: "A short page",
      mediaUrl: "https://example.com/preview.jpg",
    });
  });

  it("still archives a site when asked, with automatic archiving off", async () => {
    const { save, runtime, calls } = setup(false);

    await runArchivePage("save-1", { scope: "site" }, ctx, runtime);

    expect(calls.crawls).toHaveLength(1);
    expect(hasWarcArchive(save.files)).toBe(true);
    expect(save).toMatchObject({
      title: "Notes",
      description: "A short page",
      mediaUrl: "https://example.com/preview.jpg",
    });
  });
});

describe("archive_page for Are.na saves", () => {
  it("archives the page an Are.na Link block points at", async () => {
    const { save, runtime, calls } = setup(true, {
      source: "arena",
      url: "https://en.wikipedia.org/wiki/Community_Memory",
    });

    await runArchivePage("save-1", {}, ctx, runtime);

    expect(
      calls.crawls.map(([rootUrl, scope]) => [rootUrl.href, scope]),
    ).toEqual([["https://en.wikipedia.org/wiki/Community_Memory", "page"]]);
    expect(hasWarcArchive(save.files)).toBe(true);
  });

  it("leaves Are.na blocks that still point at are.na alone", async () => {
    const { save, runtime, calls } = setup(true, {
      source: "arena",
      url: "https://www.are.na/block/9613792",
    });

    await runArchivePage("save-1", { scope: "site" }, ctx, runtime);

    expect(calls.crawls).toEqual([]);
    expect(hasWarcArchive(save.files)).toBe(false);
  });
});
