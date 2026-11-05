import { mkdir, mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as schema from "@pond/schema/db";
import * as events from "@pond/schema/events";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import * as database from "../db";
import { createMutationQueue } from "./mutation-queue";
import { reconcileLibraryIndex } from "./scan";

function nativeAvailable() {
  try {
    new Database(":memory:").close();
    return true;
  } catch (error) {
    if (process.versions.electron) throw error;
    return false;
  }
}
const roots: string[] = [];
const opened: Database.Database[] = [];
afterEach(async () => {
  for (const db of opened.splice(0)) db.close();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "pond-scan-"));
  roots.push(root);
  const raw = new Database(":memory:");
  opened.push(raw);
  database.initializePondSchema(raw, () => false);
  const db = Object.assign(drizzle(raw, { schema: { ...schema, ...events } }), {
    $raw: raw,
  });
  const mutate = createMutationQueue().run;
  const scan = () => reconcileLibraryIndex({ root, db, mutate, changed() {} });
  raw.exec("insert into folders(id,name) values('folder','References')");
  const directory = join(root, "items", "image.info");
  await mkdir(directory, { recursive: true });
  const metadata = {
    schema: 3,
    id: "image",
    source: "local",
    sourceId: "image",
    url: "pond:image",
    title: "Original",
    tags: ["Design"],
    folderIds: ["folder"],
    mediaType: "image",
    coverIndex: 0,
    width: 20,
    height: 10,
    files: [
      {
        kind: "cover",
        path: "photo.png",
        sha256: "hash",
        size: 4,
        mimeType: "image/png",
        width: 20,
        height: 10,
      },
    ],
    savedAt: "2020-01-02T00:00:00Z",
    createdAt: "2019-01-02T00:00:00Z",
    publishedAt: "2018-01-02T00:00:00Z",
    notes: "Review",
    userData: {
      rating: 4,
      dominantColors: ["#112233"],
      rotate: 90,
      flipX: false,
      flipY: false,
      crop: null,
    },
  };
  const path = join(directory, "info.json");
  await writeFile(path, JSON.stringify(metadata));
  await writeFile(join(directory, "photo.png"), "data");
  return { db, raw, directory, path, metadata, scan };
}
describe.skipIf(!nativeAvailable())("portable index reconciliation", () => {
  it("rebuilds attachment metadata, organization, notes and readiness into a fresh index", async () => {
    const f = await fixture();
    expect(await f.scan()).toMatchObject({ updated: 1, total: 1 });
    const save = f.db.select().from(schema.saves).get();
    expect(save).toMatchObject({
      status: "complete",
      rating: 4,
      rotate: 90,
      files: [{ mimeType: "image/png", width: 20, height: 10 }],
      notes: "Review",
      publishedAt: new Date("2018-01-02T00:00:00Z"),
    });
    expect(f.db.select().from(schema.saveFolders).all()).toEqual([
      { saveId: "image", folderId: "folder" },
    ]);
    expect(await f.scan()).toMatchObject({ updated: 0, total: 1 });
  });
  it("detects in-place metadata edits even when the item directory timestamp does not change", async () => {
    const f = await fixture();
    await f.scan();
    const before = await stat(f.directory);
    await writeFile(
      f.path,
      JSON.stringify({ ...f.metadata, title: "Changed" }),
    );
    const future = new Date(Date.now() + 1000);
    await utimes(f.path, future, future);
    await utimes(f.directory, before.atime, before.mtime);
    expect((await f.scan()).updated).toBe(1);
    expect(f.db.select().from(schema.saves).get()?.title).toBe("Changed");
  });
  it("marks missing originals as failed and retries an SQL failure without a permanent scan stamp", async () => {
    const f = await fixture();
    await rm(join(f.directory, "photo.png"));
    f.raw.exec(
      "create trigger fail_scan before insert on save_folders begin select raise(abort,'injected failure'); end",
    );
    expect((await f.scan()).updated).toBe(0);
    expect(f.db.select().from(schema.saves).all()).toEqual([]);
    expect(f.db.select().from(schema.libraryScan).all()).toEqual([]);
    f.raw.exec("drop trigger fail_scan");
    expect((await f.scan()).updated).toBe(1);
    expect(f.db.select().from(schema.saves).get()?.status).toBe("failed");
  });
  it("marks a row failed when its record and originals are both gone", async () => {
    const f = await fixture();
    await f.scan();
    expect(f.db.select().from(schema.saves).get()?.status).toBe("complete");
    await rm(f.path);
    await rm(join(f.directory, "photo.png"));
    const future = new Date(Date.now() + 5000);
    await utimes(f.directory, future, future);
    expect((await f.scan()).updated).toBe(1);
    expect(f.db.select().from(schema.saves).get()?.status).toBe("failed");
    expect((await f.scan()).updated).toBe(0);
  });
  it("marks a save failed when its folder disappears so enrichment will not run", async () => {
    const f = await fixture();
    await f.scan();
    expect(f.db.select().from(schema.saves).get()?.status).toBe("complete");
    await rm(f.directory, { recursive: true });
    const missing = await f.scan();
    expect(missing.missingFiles).toEqual([{ id: "image", title: "Original" }]);
    expect(f.db.select().from(schema.saves).get()?.status).toBe("failed");
    expect((await f.scan()).missingFiles).toEqual([
      { id: "image", title: "Original" },
    ]);

    await mkdir(f.directory, { recursive: true });
    await writeFile(f.path, JSON.stringify(f.metadata));
    await writeFile(join(f.directory, "photo.png"), "data");
    const restored = await f.scan();
    expect(f.db.select().from(schema.saves).get()?.status).toBe("complete");
    expect(restored.missingFiles).toEqual([]);
  });
  it("keeps a row complete when only its record is gone but its originals remain", async () => {
    const f = await fixture();
    await f.scan();
    await rm(f.path);
    const future = new Date(Date.now() + 5000);
    await utimes(f.directory, future, future);
    expect((await f.scan()).updated).toBe(0);
    expect(f.db.select().from(schema.saves).get()?.status).toBe("complete");
  });
});
