import type { Save, SaveFile, Source } from "@pond/schema/db";
import { describe, expect, it, vi } from "vitest";
import type { SplitAllProgress } from "../../shared/saves-mutation-contracts";
import {
  runSplitAll,
  type SplitAllRuntime,
  type SplitCandidate,
  splitAllStatus,
  splittableIds,
  startSplitAll,
} from "./split-all";
import { runSplitSave, type SplitSaveRuntime } from "./split-save";
import { capture, carousel, file } from "./split-save.fixtures";

function candidate(id: string, source: Source = "instagram"): SplitCandidate {
  return {
    id,
    source,
    files: [file("image", `${id}-1.jpg`), file("image", `${id}-2.jpg`)],
  };
}

function ids(count: number): string[] {
  return Array.from(
    { length: count },
    (_, i) => `save-${String(i + 1).padStart(4, "0")}`,
  );
}

/** Pages like the real query: by ID, after the cursor, capped at the limit. */
function pager(rows: readonly SplitCandidate[]): SplitAllRuntime["page"] {
  return async (after, limit) =>
    [...rows]
      .sort((a, b) => a.id.localeCompare(b.id))
      .filter((row) => after === null || row.id > after)
      .slice(0, limit);
}

function fakeRuntime(
  rows: readonly SplitCandidate[],
  overrides: Partial<SplitAllRuntime> = {},
) {
  const split: string[] = [];
  let pauses = 0;
  const runtime: SplitAllRuntime = {
    page: pager(rows),
    optedOut: async () => new Set(),
    async split(id) {
      split.push(id);
      return { ok: true, created: [`${id}-slide`] };
    },
    library: () => "library-1",
    async pause() {
      pauses += 1;
    },
    ...overrides,
  };
  return {
    runtime,
    split,
    get pauses() {
      return pauses;
    },
  };
}

function track() {
  const reports: SplitAllProgress[] = [];
  return { reports, report: (next: SplitAllProgress) => reports.push(next) };
}

describe("splittableIds", () => {
  it("walks the whole library a page at a time", async () => {
    const pages: (string | null)[] = [];
    const page = pager(ids(1_200).map((id) => candidate(id)));
    const library = fakeRuntime([], {
      page: (after, limit) => {
        pages.push(after);
        return page(after, limit);
      },
    });
    const found = await splittableIds(library.runtime);
    expect(found).toHaveLength(1_200);
    expect(new Set(found).size).toBe(1_200);
    expect(pages).toEqual([null, "save-0500", "save-1000"]);
  });

  it("keeps only saves with several images or videos", async () => {
    const single: SplitCandidate = {
      id: "single",
      source: "instagram",
      files: [file("image", "one.jpg"), file("thumbnail", "one.webp")],
    };
    const library = fakeRuntime([candidate("carousel"), single]);
    expect(await splittableIds(library.runtime)).toEqual(["carousel"]);
  });

  it("leaves sources whose own setting turns splitting off", async () => {
    const library = fakeRuntime(
      [candidate("a", "instagram"), candidate("b", "pinterest")],
      { optedOut: async () => new Set<Source>(["instagram"]) },
    );
    expect(await splittableIds(library.runtime)).toEqual(["b"]);
  });
});

describe("runSplitAll", () => {
  it("splits in bounded batches and reports after each one", async () => {
    const library = fakeRuntime(ids(45).map((id) => candidate(id)));
    const { reports, report } = track();
    const final = await runSplitAll(library.runtime, report);
    expect(reports.map((entry) => entry.processed)).toEqual([0, 20, 40, 45]);
    expect(reports.every((entry) => entry.running && entry.total === 45)).toBe(
      true,
    );
    expect(library.pauses).toBe(3);
    expect(final).toEqual({
      running: false,
      total: 45,
      processed: 45,
      split: 45,
      created: 45,
      failed: 0,
    });
  });

  it("skips a save that fails and keeps going", async () => {
    const library = fakeRuntime(
      ["a", "b", "c", "d"].map((id) => candidate(id)),
      {
        async split(id) {
          if (id === "b") throw new Error("disk full");
          if (id === "c") return { ok: false, reason: "single" };
          return { ok: true, created: [`${id}-2`, `${id}-3`] };
        },
      },
    );
    const final = await runSplitAll(library.runtime, () => {});
    expect(final).toMatchObject({
      total: 4,
      processed: 4,
      split: 2,
      created: 4,
      failed: 1,
    });
  });

  it("stops when the library changes under it", async () => {
    let library = "library-1";
    const fake = fakeRuntime(
      ids(30).map((id) => candidate(id)),
      {
        library: () => library,
        async split() {
          library = "library-2";
          return { ok: true, created: ["slide"] };
        },
      },
    );
    const final = await runSplitAll(fake.runtime, () => {});
    expect(final.processed).toBe(20);
    expect(final.total).toBe(30);
  });
});

describe("startSplitAll", () => {
  it("runs one split at a time", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls: string[] = [];
    const library = fakeRuntime([candidate("a")], {
      async split(id) {
        calls.push(id);
        await gate;
        return { ok: true, created: [`${id}-2`] };
      },
    });
    expect(startSplitAll(library.runtime).running).toBe(true);
    expect(startSplitAll(library.runtime).running).toBe(true);
    await vi.waitFor(() => expect(calls).toEqual(["a"]));
    release();
    await vi.waitFor(() => expect(splitAllStatus().running).toBe(false));
    expect(calls).toEqual(["a"]);
    expect(splitAllStatus()).toMatchObject({ total: 1, split: 1, created: 1 });
  });
});

/** A library of carousels split by the real `runSplitSave`, where a quit skips the rollback. */
function carouselLibrary(count: number) {
  const rows = new Map<string, Save>();
  for (const id of ids(count)) {
    const media = capture({ id });
    rows.set(
      id,
      carousel({
        id,
        sourceId: id,
        rawJson: {
          capture: media,
          extractorId: "instagram",
          extractedAt: "2026-10-01T12:00:00.000Z",
        },
        files: carousel().files.map((entry) => ({
          ...entry,
          sha256: `${id}-${entry.path}`,
        })),
      }),
    );
  }
  let next = 0;
  let quitAfter = Number.POSITIVE_INFINITY;
  let copies = 0;
  const quit = () => copies >= quitAfter;
  const runtime: SplitSaveRuntime = {
    read: async (id) => rows.get(id) ?? null,
    async findSlide(row) {
      for (const save of rows.values())
        if (save.source === row.source && save.sourceId === row.sourceId)
          return save.id;
      return null;
    },
    async create(row) {
      if (quit()) throw new Error("Pond quit");
      if (!row.id) throw new Error("Slides arrive with an ID");
      rows.set(row.id, {
        ...carousel(),
        ...row,
        id: row.id,
        files: [],
        status: "ingesting",
      });
    },
    async copyFiles(_from, to, files) {
      copies += 1;
      if (quit()) throw new Error("Pond quit");
      const slide = rows.get(to);
      if (slide)
        rows.set(to, { ...slide, files: [...files], status: "complete" });
      return files.length;
    },
    async copyMemberships() {},
    async discard(fresh) {
      if (quit()) return;
      for (const id of fresh) rows.delete(id);
    },
    async updateOriginal(id, { patch }) {
      const save = rows.get(id);
      if (save)
        rows.set(id, {
          ...save,
          files: patch.files ?? save.files,
          rawJson: patch.rawJson ?? save.rawJson,
        });
    },
    async refresh() {},
    newId: () => `slide-${String(++next).padStart(4, "0")}`,
  };
  const page: SplitAllRuntime["page"] = async (after, limit) =>
    [...rows.values()]
      .filter((save) => save.status === "complete" && save.deletedAt == null)
      .sort((a, b) => a.id.localeCompare(b.id))
      .filter((save) => after === null || save.id > after)
      .slice(0, limit)
      .map(({ id, source, files }) => ({ id, source, files }));
  function backfill(): SplitAllRuntime {
    return {
      page,
      optedOut: async () => new Set(),
      split: (id) =>
        quit()
          ? Promise.reject(new Error("Pond quit"))
          : runSplitSave(id, "user", runtime),
      library: () => (quit() ? "closed" : "library-1"),
      pause: async () => {},
    };
  }
  return {
    rows,
    backfill,
    quitAfterCopies(limit: number) {
      quitAfter = limit;
    },
    reopen() {
      quitAfter = Number.POSITIVE_INFINITY;
    },
  };
}

function slideFiles(files: readonly SaveFile[]): string[] {
  return files
    .filter((entry) => entry.kind === "image" || entry.kind === "video")
    .map((entry) => entry.path);
}

describe("split all after a quit", () => {
  it("picks up the saves left over without duplicating any slide", async () => {
    const library = carouselLibrary(25);
    library.quitAfterCopies(29);
    const first = await runSplitAll(library.backfill(), () => {});
    expect(first.split).toBe(14);
    expect(first.processed).toBe(20);

    library.reopen();
    const second = await runSplitAll(library.backfill(), () => {});
    expect(second).toMatchObject({ total: 11, split: 11, failed: 0 });
    expect(await splittableIds(library.backfill())).toEqual([]);

    const saves = [...library.rows.values()];
    expect(saves).toHaveLength(75);
    const keys = saves.map((save) => `${save.source} ${save.sourceId}`);
    expect(new Set(keys).size).toBe(75);
    for (const save of saves) expect(slideFiles(save.files)).toHaveLength(1);
  });
});
