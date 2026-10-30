import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NewSave } from "@pond/schema/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ManualSaveInput } from "./manual-import";
import {
  importMymindExport,
  type MymindImportDependencies,
} from "./mymind-import";

let root = "";
let exportDirectory = "";

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "pond-mymind-import-"));
  exportDirectory = join(root, "export");
  await mkdir(exportDirectory, { recursive: true });
  await Promise.all([
    writeFile(
      join(exportDirectory, "cards.csv"),
      [
        "id,type,title,url,content,note,tags,created",
        'link-1,WebPage,"An article, with a comma",https://example.com/article,,"Line one\nLine two","research, #reference",2024-03-01T12:00:00.000Z',
        "note-1,Note,A note,,Note body,,personal,2024-03-02T12:00:00.000Z",
        "image-1,Image,missing.png,,,,,2024-03-03T12:00:00.000Z",
        "video-1,Video,clip.webm,,,,,2024-03-04T12:00:00.000Z",
      ].join("\n"),
    ),
    writeFile(join(exportDirectory, "clip.webm"), "video"),
    writeFile(join(exportDirectory, "design.psd"), "image"),
    writeFile(join(exportDirectory, "archive.mkv"), "video"),
  ]);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

interface ImportFixture {
  dependencies: MymindImportDependencies;
  links: Map<string, { id: string; metadata: Partial<NewSave> }>;
  saves: Map<string, ManualSaveInput>;
}

function csvCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function createImportFixture(): ImportFixture {
  const links = new Map<string, { id: string; metadata: Partial<NewSave> }>();
  const saves = new Map<string, ManualSaveInput>();
  return {
    links,
    saves,
    dependencies: {
      async createSave(input) {
        const sourceId = input.sourceId ?? `generated:${saves.size}`;
        if (saves.has(sourceId))
          return { ok: true, id: sourceId, skipped: true };
        saves.set(sourceId, input);
        return { ok: true, id: sourceId };
      },
      async enqueueLink(url) {
        const current = links.get(url);
        if (current) return { id: current.id, created: false };
        const id = `link:${links.size}`;
        links.set(url, { id, metadata: {} });
        return { id, created: true };
      },
      async persistLinkMetadata(id, patch) {
        const link = [...links.values()].find(
          (candidate) => candidate.id === id,
        );
        if (!link) return false;
        Object.assign(link.metadata, patch);
        return true;
      },
      async setLinkTags(id, tags) {
        const link = [...links.values()].find(
          (candidate) => candidate.id === id,
        );
        if (!link) return { ok: false, error: "Save not found." };
        link.metadata.tags = tags;
        return { ok: true };
      },
    },
  };
}

describe("importMymindExport", () => {
  it("imports CSV metadata and supported media, reports missing files, and preserves edits on repeat", async () => {
    const fixture = createImportFixture();
    const first = await importMymindExport(
      exportDirectory,
      fixture.dependencies,
    );
    expect(first).toEqual({ ok: true, imported: 5, skipped: 1 });

    const link = fixture.links.get("https://example.com/article");
    expect(link?.metadata).toMatchObject({
      importedFrom: "mymind",
      notes: "Line one\nLine two",
      tags: ["research", "reference"],
      savedAt: new Date("2024-03-01T12:00:00.000Z"),
      createdAt: new Date("2024-03-01T12:00:00.000Z"),
    });
    expect(fixture.saves.get("mymind:note-1")).toMatchObject({
      importedFrom: "mymind",
      note: "Note body",
      tags: ["personal"],
      savedAt: new Date("2024-03-02T12:00:00.000Z"),
    });
    expect(fixture.saves.get("mymind:video-1")?.filePaths).toEqual([
      join(exportDirectory, "clip.webm"),
    ]);

    if (!link) throw new Error("Expected the link fixture to exist.");
    link.metadata = { notes: "Edited in Pond", tags: ["pond-only"] };
    const second = await importMymindExport(
      exportDirectory,
      fixture.dependencies,
    );
    expect(second).toEqual({ ok: true, imported: 0, skipped: 6 });
    expect(link.metadata).toEqual({
      notes: "Edited in Pond",
      tags: ["pond-only"],
    });
  });

  it("skips empty cards instead of stopping the import", async () => {
    const directory = join(root, "empty-cards");
    await mkdir(directory);
    await writeFile(
      join(directory, "cards.csv"),
      [
        "id,type,title,url,content,note,tags,created",
        "empty-1,Placeholder,,,,,,2024-03-01T12:00:00.000Z",
        "empty-2,Quotation,,,,,saved,2024-03-02T12:00:00.000Z",
        "note-1,Note,A note,,Note body,,,2024-03-03T12:00:00.000Z",
      ].join("\n"),
    );
    const fixture = createImportFixture();
    fixture.dependencies.createSave = async (input) => {
      if (!input.title && !input.note && !input.filePaths?.length)
        return { ok: false, error: "empty Save" };
      fixture.saves.set(input.sourceId ?? "", input);
      return { ok: true, id: input.sourceId ?? "" };
    };

    await expect(
      importMymindExport(directory, fixture.dependencies),
    ).resolves.toEqual({ ok: true, imported: 1, skipped: 2 });
    expect([...fixture.saves.keys()]).toEqual(["mymind:note-1"]);
  });

  it("matches files named by card id and keeps the card's metadata on one Save", async () => {
    const directory = join(root, "id-named-files");
    await mkdir(directory);
    await Promise.all([
      writeFile(
        join(directory, "cards.csv"),
        [
          "id,type,title,url,content,note,tags,created",
          'Img1,Image,Red book cover,https://example.com/post,,Found at the fair,"typography, books",2024-04-01T12:00:00.000Z',
          "Doc1,Document,A paper,,,,research,2024-04-02T12:00:00.000Z",
        ].join("\n"),
      ),
      writeFile(join(directory, "Img1.jpeg"), "image"),
      writeFile(join(directory, "Doc1.pdf"), "pdf"),
    ]);
    const fixture = createImportFixture();

    await expect(
      importMymindExport(directory, fixture.dependencies),
    ).resolves.toEqual({ ok: true, imported: 2, skipped: 0 });
    expect(fixture.links.size).toBe(0);
    expect(fixture.saves.get("mymind:Img1")).toEqual({
      source: "local",
      sourceId: "mymind:Img1",
      importedFrom: "mymind",
      filePaths: [join(directory, "Img1.jpeg")],
      title: "Red book cover",
      url: "https://example.com/post",
      note: "Found at the fair",
      tags: ["typography", "books"],
      savedAt: new Date("2024-04-01T12:00:00.000Z"),
      createdAt: new Date("2024-04-01T12:00:00.000Z"),
    });
    expect(fixture.saves.get("mymind:Doc1")).toMatchObject({
      filePaths: [join(directory, "Doc1.pdf")],
      title: "A paper",
      url: null,
      tags: ["research"],
    });
  });

  it("does not apply dumped binary fields as tags", async () => {
    const directory = join(root, "binary-tags");
    await mkdir(directory);
    const encodedBlob = `${"A+B/".repeat(1000)}==`;
    const controlBlob = Array.from({ length: 2400 }, (_, index) =>
      String.fromCharCode((index % 30) + 1),
    ).join("");
    await writeFile(
      join(directory, "cards.csv"),
      [
        "id,type,title,url,content,note,tags,created",
        `dump-1,Note,Encoded dump,,body,,${csvCell(encodedBlob)},2024-03-01T12:00:00.000Z`,
        `dump-2,Note,Control dump,,body,,${csvCell(controlBlob)},2024-03-02T12:00:00.000Z`,
        'ok-1,Note,Fine note,,body,,"research, café, work in progress, 日本語, C++",2024-03-03T12:00:00.000Z',
      ].join("\n"),
    );
    const fixture = createImportFixture();

    await expect(
      importMymindExport(directory, fixture.dependencies),
    ).resolves.toEqual({ ok: true, imported: 3, skipped: 0 });
    expect(fixture.saves.get("mymind:dump-1")?.tags).toEqual([]);
    expect(fixture.saves.get("mymind:dump-2")?.tags).toEqual([]);
    expect(fixture.saves.get("mymind:ok-1")?.tags).toEqual([
      "research",
      "café",
      "work in progress",
      "日本語",
      "C++",
    ]);
  });

  it("rejects a cards.csv that is not a mymind export", async () => {
    const directory = join(root, "invalid");
    await mkdir(directory);
    await writeFile(
      join(directory, "cards.csv"),
      "name,email\nAda,ada@example.com",
    );

    await expect(
      importMymindExport(directory, createImportFixture().dependencies),
    ).resolves.toEqual({
      ok: false,
      error: "Couldn't import cards.csv: the file isn't a mymind export",
    });
  });

  it("reports a metadata write failure instead of claiming success", async () => {
    const fixture = createImportFixture();
    fixture.dependencies.persistLinkMetadata = async () => false;

    await expect(
      importMymindExport(exportDirectory, fixture.dependencies),
    ).resolves.toEqual({
      ok: false,
      error:
        "Couldn't import An article, with a comma: its details couldn't be saved",
    });
  });
});
