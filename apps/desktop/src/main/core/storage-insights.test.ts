import * as schema from "@pond/schema/db";
import * as events from "@pond/schema/events";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { type Db, initializePondSchema } from "../db";
import {
  duplicateStorage,
  type LargestFilesInput,
  largestFiles,
  largestSaves,
  storageAttribution,
} from "./storage-insights";

function nativeAvailable() {
  try {
    new Database(":memory:").close();
    return true;
  } catch (error) {
    if (process.versions.electron) throw error;
    return false;
  }
}

const opened: Database.Database[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

interface FileFixture {
  kind: string;
  path: string;
  sha256: string;
  size?: number;
}

interface SaveFixture {
  id: string;
  source?: string;
  url?: string;
  title?: string | null;
  mediaType?: string;
  fileSize?: number;
  files?: FileFixture[];
  deleted?: boolean;
  folders?: string[];
}

function open(
  fixtures: SaveFixture[],
  folders: { id: string; parentId: string | null }[] = [],
): Db {
  const raw = new Database(":memory:");
  opened.push(raw);
  initializePondSchema(raw, () => false);
  const folder = raw.prepare(
    "insert into folders(id,parent_id,name) values(?,?,?)",
  );
  for (const entry of folders) folder.run(entry.id, entry.parentId, entry.id);
  const insert = raw.prepare(
    "insert into saves(id,source,source_id,url,status,title,media_type,file_size,files,deleted_at) values(?,?,?,?,?,?,?,?,?,?)",
  );
  const member = raw.prepare(
    "insert into save_folders(save_id,folder_id) values(?,?)",
  );
  for (const save of fixtures) {
    const entries = save.files ?? [];
    const sized = entries.reduce((sum, entry) => sum + (entry.size ?? 0), 0);
    insert.run(
      save.id,
      save.source ?? "web",
      save.id,
      save.url ?? `https://example.com/${save.id}`,
      "complete",
      save.title === undefined ? save.id : save.title,
      save.mediaType ?? null,
      save.fileSize ?? sized,
      JSON.stringify(entries),
      save.deleted ? Date.now() : null,
    );
    for (const id of save.folders ?? []) member.run(save.id, id);
  }
  return Object.assign(drizzle(raw, { schema: { ...schema, ...events } }), {
    $raw: raw,
  });
}

function file(
  path: string,
  size: number | undefined,
  kind = "image",
  sha256 = path,
): FileFixture {
  return { kind, path, sha256, size };
}

function searchable(): Db {
  return open([
    {
      id: "titled",
      url: "https://example.com/harbor",
      title: "Sunset Reel",
      fileSize: 300,
    },
    {
      id: "untitled",
      url: "https://example.com/harbor-tour",
      title: null,
      fileSize: 200,
    },
    {
      id: "other",
      url: "https://example.com/forest",
      title: "Forest Walk",
      fileSize: 100,
    },
  ]);
}

function ids(db: Db, search: string) {
  return largestSaves(db, { limit: 10, search }).saves.map((save) => save.id);
}

describe.skipIf(!nativeAvailable())("largest Saves", () => {
  it("matches the URL of a Save that has a title", () => {
    expect(ids(searchable(), "harbor")).toEqual(["titled", "untitled"]);
  });

  it("matches the title without regard to case", () => {
    expect(ids(searchable(), "sunset")).toEqual(["titled"]);
  });

  it("ranks smallest first when asked", () => {
    const rows = largestSaves(searchable(), { limit: 10, order: "smallest" });
    expect(rows.saves.map((save) => save.id)).toEqual([
      "other",
      "untitled",
      "titled",
    ]);
  });

  it("keeps only Saves at or above a minimum size", () => {
    const rows = largestSaves(searchable(), { limit: 10, minBytes: 200 });
    expect(rows.saves.map((save) => save.id)).toEqual(["titled", "untitled"]);
  });
});

function files(input: Partial<LargestFilesInput> = {}) {
  const db = open([
    {
      id: "reel",
      files: [
        file("media/reel.mp4", 900, "video"),
        file("thumb.webp", 20, "thumbnail"),
      ],
    },
    { id: "photo", files: [file("photo.PNG", 400)] },
    { id: "trashed", deleted: true, files: [file("gone.mp4", 5000)] },
  ]);
  return largestFiles(db, { limit: 10, ...input });
}

function names(input: Partial<LargestFilesInput>) {
  return files(input).files.map((row) => row.name);
}

describe.skipIf(!nativeAvailable())("largest files", () => {
  it("ranks single files across Saves and leaves Trash out", () => {
    const saves = files().files.map((row) => row.saveId);
    expect(saves).toEqual(["reel", "photo", "reel"]);
  });

  it("returns the file name, never its folder", () => {
    expect(files({ limit: 1 }).files[0]).toMatchObject({
      fileIndex: 0,
      name: "reel.mp4",
      kind: "video",
      extension: "mp4",
      size: 900,
    });
  });

  it("filters by extension without regard to case", () => {
    expect(names({ extension: "png" })).toEqual(["photo.PNG"]);
  });

  it("filters by kind and searches file names", () => {
    expect(names({ kind: "thumbnail" })).toEqual(["thumb.webp"]);
    expect(names({ search: "PHOTO" })).toEqual(["photo.PNG"]);
  });

  it("offers kinds and extensions that have sized files", () => {
    const facets = files();
    expect(facets.kinds).toEqual(["image", "thumbnail", "video"]);
    expect(facets.extensions).toEqual(["mp4", "png", "webp"]);
  });
});

describe.skipIf(!nativeAvailable())("storage attribution", () => {
  const db = () =>
    open([
      {
        id: "clip",
        source: "local",
        mediaType: "video",
        files: [file("clip.mp4", 700, "video"), file("clip.jpg", 100)],
      },
      {
        id: "still",
        source: "local",
        mediaType: "image",
        fileSize: 50,
        files: [file("still.jpg", 200), file("still-2.jpg", undefined)],
      },
      { id: "trashed", deleted: true, files: [file("old.mp4", 9000)] },
    ]);

  it("sums every recorded file size, not the first file alone", () => {
    const result = storageAttribution(db());
    expect(result.totalBytes).toBe(1000);
    expect(result.saves).toBe(2);
    expect(result.types).toEqual([
      { key: "video", bytes: 800, saves: 1 },
      { key: "image", bytes: 200, saves: 1 },
    ]);
  });

  it("groups by the source identity the Library filters on", () => {
    expect(storageAttribution(db()).sources).toEqual([
      { key: "local", bytes: 1000, saves: 2 },
    ]);
  });

  it("groups by file extension and counts each Save once", () => {
    expect(storageAttribution(db()).extensions).toEqual([
      { key: "mp4", bytes: 700, saves: 1 },
      { key: "jpg", bytes: 300, saves: 2 },
    ]);
  });

  it("reports files without a recorded size instead of counting them", () => {
    expect(storageAttribution(db()).unsizedFiles).toBe(1);
  });
});

describe.skipIf(!nativeAvailable())("folder storage", () => {
  const db = () =>
    open(
      [
        { id: "a", files: [file("a.jpg", 100)], folders: ["work", "client"] },
        { id: "b", files: [file("b.jpg", 40)], folders: ["client"] },
        { id: "c", files: [file("c.jpg", 10)], folders: ["home"] },
        {
          id: "gone",
          deleted: true,
          files: [file("gone.jpg", 999)],
          folders: ["work"],
        },
      ],
      [
        { id: "work", parentId: null },
        { id: "client", parentId: "work" },
        { id: "home", parentId: null },
      ],
    );

  it("rolls subfolders into their top-level folder once per Save", () => {
    expect(storageAttribution(db()).folders).toEqual([
      { id: "work", name: "work", bytes: 140, saves: 2 },
      { id: "home", name: "home", bytes: 10, saves: 1 },
    ]);
  });
});

describe.skipIf(!nativeAvailable())("duplicate storage", () => {
  it("counts every exact copy past the first, ignoring previews", () => {
    const result = duplicateStorage(
      open([
        {
          id: "first",
          files: [
            file("one.png", 300, "image", "same"),
            file("first-thumb.webp", 10, "thumbnail"),
          ],
        },
        {
          id: "second",
          files: [
            file("two.png", 300, "image", "same"),
            file("second-thumb.webp", 12, "thumbnail"),
          ],
        },
        { id: "third", files: [file("three.png", 300, "image", "same")] },
        { id: "unique", files: [file("unique.png", 500)] },
      ]),
    );
    expect(result).toMatchObject({ groups: 1, saves: 3, extraBytes: 600 });
    expect([...result.ids].sort()).toEqual(["first", "second", "third"]);
  });

  it("leaves Trash out of duplicate groups", () => {
    const result = duplicateStorage(
      open([
        { id: "kept", files: [file("a.png", 300, "image", "same")] },
        {
          id: "trashed",
          deleted: true,
          files: [file("b.png", 300, "image", "same")],
        },
      ]),
    );
    expect(result).toMatchObject({ groups: 0, saves: 0, extraBytes: 0 });
  });
});
