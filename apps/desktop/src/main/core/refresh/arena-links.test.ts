import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import type { ArenaLinkConversionProgress } from "../../../shared/arena-link-contracts";
import { initializePondSchema } from "../../db";
import {
  type ArenaLinkJobDeps,
  convertArenaLinks,
  convertedArenaLinks,
  countIngesting,
  listUnconvertedArenaLinks,
  restoreLinkedPageHarvests,
} from "./arena-links";

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

function openDb() {
  const raw = new Database(":memory:");
  opened.push(raw);
  initializePondSchema(raw, () => false);
  return { $raw: raw };
}

interface SaveRow {
  id: string;
  source?: string;
  url: string;
  status?: string;
  deletedAt?: number | null;
  linkUrl?: string;
  blockClass?: string;
}

function insertSave(db: ReturnType<typeof openDb>, row: SaveRow): void {
  const capture = {
    id: row.id,
    source: row.source ?? "arena",
    url: row.linkUrl ?? row.url,
    media: [],
    extras: row.blockClass ? { blockClass: row.blockClass } : undefined,
  };
  db.$raw
    .prepare(
      "insert into saves(id,source,source_id,url,status,deleted_at,raw_json,saved_at) values(?,?,?,?,?,?,?,?)",
    )
    .run(
      row.id,
      row.source ?? "arena",
      row.id,
      row.url,
      row.status ?? "complete",
      row.deletedAt ?? null,
      JSON.stringify({ capture, extractorId: "arena", extractedAt: "" }),
      Number(row.id.replace(/\D/g, "") || 0),
    );
}

const block = (id: string) => `https://www.are.na/block/${id}`;

describe.skipIf(!nativeAvailable())("Are.na Link selection", () => {
  it("picks Link saves that still open the block, oldest first", () => {
    const db = openDb();
    insertSave(db, {
      id: "s2",
      url: block("2"),
      linkUrl: "https://example.com/b",
      blockClass: "Link",
      status: "failed",
    });
    insertSave(db, {
      id: "s1",
      url: block("1"),
      linkUrl: "https://example.com/a",
      blockClass: "Link",
    });
    insertSave(db, {
      id: "s3",
      url: "https://example.com/c",
      blockClass: "Link",
    });
    insertSave(db, {
      id: "s4",
      url: block("4"),
      linkUrl: "https://example.com/d",
      blockClass: "Image",
    });
    insertSave(db, {
      id: "s5",
      url: block("5"),
      linkUrl: "https://www.are.na/someone/channel",
      blockClass: "Link",
    });
    insertSave(db, {
      id: "s6",
      url: block("6"),
      linkUrl: "https://example.com/f",
      blockClass: "Link",
      deletedAt: Date.now(),
    });
    insertSave(db, {
      id: "s7",
      source: "web",
      url: "https://example.com/g",
      blockClass: "Link",
    });

    expect(listUnconvertedArenaLinks(db)).toEqual(["s1", "s2"]);
  });

  it("skips saves an interrupted run left converting, so a rerun never queues them twice", () => {
    const db = openDb();
    insertSave(db, {
      id: "s1",
      url: block("1"),
      linkUrl: "https://example.com/a",
      blockClass: "link",
      status: "ingesting",
    });
    insertSave(db, {
      id: "s2",
      url: "https://example.com/b",
      blockClass: "Link",
    });
    insertSave(db, {
      id: "s3",
      url: block("3"),
      linkUrl: "https://example.com/c",
      blockClass: "Link",
    });

    expect(listUnconvertedArenaLinks(db)).toEqual(["s3"]);
    expect(countIngesting(db, ["s1", "s2", "s3"])).toBe(1);
  });

  it("counts a save as converted once it opens the linked page", () => {
    const db = openDb();
    insertSave(db, { id: "s1", url: "https://example.com/a" });
    insertSave(db, { id: "s2", url: block("2") });

    expect([...convertedArenaLinks(db, ["s1", "s2"])]).toEqual(["s1"]);
  });

  it("puts settled linked-page harvests back on the Are.na budget", () => {
    const db = openDb();
    insertSave(db, { id: "s1", url: "https://example.com/a" });
    insertSave(db, { id: "s2", url: block("2") });
    const insertTask = db.$raw.prepare(
      "insert into tasks(id,save_id,source,op,status,payload) values(?,?,?,?,?,?)",
    );
    const payload = JSON.stringify({ force: true, linkedPage: true });
    insertTask.run("t1", "s1", "web", "harvest_metadata", "done", payload);
    insertTask.run("t2", "s2", "web", "harvest_metadata", "pending", payload);

    restoreLinkedPageHarvests(db);

    const rows = db.$raw
      .prepare("select id, source, payload from tasks order by id")
      .all();
    expect(rows).toEqual([
      { id: "t1", source: "arena", payload: null },
      { id: "t2", source: "web", payload },
    ]);
  });
});

function fakeLibrary(ids: string[], options: { failing?: string[] } = {}) {
  const converted = new Set<string>();
  const ingesting = new Set<string>();
  const queued: string[] = [];
  const settled: string[][] = [];
  let interruptAfter = Number.POSITIVE_INFINITY;
  const deps: ArenaLinkJobDeps = {
    batchSize: 2,
    list: async () =>
      ids.filter((id) => !converted.has(id) && !ingesting.has(id)),
    queue: async (id) => {
      queued.push(id);
      if (options.failing?.includes(id)) return false;
      ingesting.add(id);
      return true;
    },
    settle: async (batch) => {
      if (settled.length >= interruptAfter) throw new Error("quit");
      settled.push([...batch]);
      for (const id of batch) {
        ingesting.delete(id);
        converted.add(id);
      }
    },
    converted: async (batch) =>
      new Set(batch.filter((id) => converted.has(id))),
    restore: async () => {},
  };
  return {
    deps,
    queued,
    settled,
    interruptAfter(batches: number) {
      interruptAfter = batches;
    },
    /** The durable queue finishes what was in flight when the app quit. */
    relaunch() {
      for (const id of ingesting) converted.add(id);
      ingesting.clear();
      interruptAfter = Number.POSITIVE_INFINITY;
    },
  };
}

describe("Are.na Link conversion", () => {
  it("queues bounded batches and waits for each to settle before the next", async () => {
    const library = fakeLibrary(["a", "b", "c", "d", "e"]);
    const progress: ArenaLinkConversionProgress[] = [];

    const result = await convertArenaLinks(
      (update) => progress.push(update),
      library.deps,
    );

    expect(library.settled).toEqual([["a", "b"], ["c", "d"], ["e"]]);
    expect(progress.map((update) => update.processed)).toEqual([0, 2, 4, 5]);
    expect(result).toEqual({
      ok: true,
      processed: 5,
      total: 5,
      converted: 5,
      failed: 0,
    });
  });

  it("counts saves that could not be queued as failed", async () => {
    const library = fakeLibrary(["a", "b", "c"], { failing: ["b"] });

    const result = await convertArenaLinks(undefined, library.deps);

    expect(library.settled).toEqual([["a"], ["c"]]);
    expect(result).toMatchObject({ converted: 2, failed: 1 });
  });

  it("runs one conversion at a time", async () => {
    const library = fakeLibrary(["a"]);

    const first = convertArenaLinks(undefined, library.deps);
    const second = await convertArenaLinks(undefined, library.deps);

    expect(second).toEqual({ ok: false, reason: "already_running" });
    await expect(first).resolves.toMatchObject({ ok: true, converted: 1 });
  });

  it("resumes after an interruption with only the saves left to convert", async () => {
    const library = fakeLibrary(["a", "b", "c", "d", "e"]);
    library.interruptAfter(1);

    await expect(convertArenaLinks(undefined, library.deps)).rejects.toThrow(
      "quit",
    );
    library.relaunch();
    const result = await convertArenaLinks(undefined, library.deps);

    expect(library.queued).toEqual(["a", "b", "c", "d", "e"]);
    expect(result).toMatchObject({ total: 1, converted: 1, failed: 0 });
  });
});
