import { PrefsSchema, type SaveFile } from "@pond/schema/db";
import { describe, expect, it, vi } from "vitest";
import type { WriteFileArgs } from "./apply";
import { hasWarcArchive, runArchivePage } from "./archive-page";

const preview: SaveFile = {
  kind: "image",
  path: "preview.jpg",
  sha256: "abc",
  size: 4,
};

function setup(autoArchive: boolean) {
  const save = {
    source: "web" as const,
    url: "https://example.com/notes",
    title: "Notes",
    description: "A short page",
    mediaUrl: "https://example.com/preview.jpg",
    files: [preview],
  };
  const readSave = vi.fn(async () => save);
  const autoArchivePages = vi.fn(async () => autoArchive);
  const crawlSite = vi.fn(async () => ({
    pages: [{ url: save.url, title: save.title }],
    warcBytes: Buffer.from("warc"),
  }));
  const persistArchive = vi.fn(
    async (_saveId: string, files: WriteFileArgs[]) => {
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
  );
  return { save, readSave, autoArchivePages, crawlSite, persistArchive };
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
    const { save, readSave, autoArchivePages, crawlSite, persistArchive } =
      setup(true);

    await runArchivePage("save-1", {}, ctx, {
      readSave,
      autoArchive: autoArchivePages,
      crawlSite,
      persistArchive,
    });

    expect(autoArchivePages).toHaveBeenCalled();
    expect(crawlSite).toHaveBeenCalledOnce();
    expect(persistArchive).toHaveBeenCalledOnce();
    expect(hasWarcArchive(save.files)).toBe(true);
    expect(save.files.map((file) => file.path)).toContain("preview.jpg");
    expect(save).toMatchObject({
      title: "Notes",
      description: "A short page",
      mediaUrl: "https://example.com/preview.jpg",
    });
  });

  it("keeps metadata only and writes no archive when automatic archiving is off", async () => {
    const { save, readSave, autoArchivePages, crawlSite, persistArchive } =
      setup(false);

    await runArchivePage("save-1", {}, ctx, {
      readSave,
      autoArchive: autoArchivePages,
      crawlSite,
      persistArchive,
    });

    expect(autoArchivePages).toHaveBeenCalled();
    expect(crawlSite).not.toHaveBeenCalled();
    expect(persistArchive).not.toHaveBeenCalled();
    expect(hasWarcArchive(save.files)).toBe(false);
    expect(save.files).toEqual([preview]);
    expect(save).toMatchObject({
      title: "Notes",
      description: "A short page",
      mediaUrl: "https://example.com/preview.jpg",
    });
  });

  it("still archives a site when asked, with automatic archiving off", async () => {
    const { save, readSave, autoArchivePages, crawlSite, persistArchive } =
      setup(false);

    await runArchivePage("save-1", { scope: "site" }, ctx, {
      readSave,
      autoArchive: autoArchivePages,
      crawlSite,
      persistArchive,
    });

    expect(crawlSite).toHaveBeenCalledOnce();
    expect(hasWarcArchive(save.files)).toBe(true);
    expect(save).toMatchObject({
      title: "Notes",
      description: "A short page",
      mediaUrl: "https://example.com/preview.jpg",
    });
  });
});
