import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MediaWarmSnapshot } from "../../../shared/library-health-contracts";
import type {
  LibraryIntegrityRuntime,
  PayloadInspection,
} from "../library-integrity";
import {
  createLibraryHealthService,
  type HealthIndexReport,
  type HealthSave,
} from "./service";
import { createLibraryHealthStore } from "./store";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

const MEDIA: MediaWarmSnapshot = {
  state: "complete",
  prepared: 0,
  remaining: 0,
  currentTitle: null,
  pauseReason: null,
  lastError: null,
  pendingPosters: 0,
  activeSaveIds: [],
  discovering: false,
  failures: [],
};

function file(kind: string, path: string, extra: { custom?: boolean } = {}) {
  return { kind, path, size: 4, sha256: `sha-${path}`, ...extra };
}

function save(
  id: string,
  files: HealthSave["files"],
  status: HealthSave["status"] = "complete",
): HealthSave {
  return {
    id,
    title: `Title ${id}`,
    source: "web",
    sourceId: id,
    url: `https://example.com/${id}`,
    files,
    status,
    blurhash: "L00000fQfQfQfQfQfQfQfQfQfQfQ",
    coverIndex: 0,
  };
}

function healthy(id: string): HealthSave {
  return save(id, [
    file("image", `${id}.png`),
    file("thumbnail", `${id}.png_thumbnail.png`, { custom: true }),
  ]);
}

async function fixture(
  rows: HealthSave[],
  options: {
    missing?: string[];
    unreadable?: string[];
    index?: HealthIndexReport;
    gate?: Promise<void>;
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), "pond-library-health-"));
  roots.push(root);
  const missing = new Set(options.missing);
  const unreadable = new Set(options.unreadable);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const runtime: LibraryIntegrityRuntime = {
    root: () => root,
    listSaves: async () => rows,
    getSave: async () => null,
    async inspectPayload(path, expected): Promise<PayloadInspection> {
      await options.gate;
      const name = basename(path);
      if (unreadable.has(name)) throw new Error(`EACCES: ${name}`);
      return missing.has(name)
        ? { ok: false, size: null, sha256: null, reason: "missing" }
        : {
            ok: true,
            size: expected.size,
            sha256: expected.sha256,
            reason: "ok",
          };
    },
    canRenderThumbnail: async (path) => path.endsWith(".png"),
    async readInfo(path) {
      const row = byId.get(basename(dirname(path)).replace(/\.info$/, ""));
      if (!row) return { status: "missing" };
      return {
        status: "valid",
        fingerprint: row.id,
        value: {
          id: row.id,
          source: row.source,
          sourceId: row.sourceId,
          url: row.url,
          files: row.files.map(({ path, size, sha256 }) => ({
            path,
            size,
            sha256,
          })),
        },
      };
    },
  };
  const store = createLibraryHealthStore(() => join(root, "health"));
  let now = 1_000;
  const create = () =>
    createLibraryHealthService({
      now: () => (now += 10),
      libraryId: () => "library-1",
      integrityRuntime: runtime,
      listSaves: async () => rows,
      getSave: async (id) => byId.get(id) ?? null,
      verifyIndex: async () =>
        options.index ?? { orphans: [], missing: [], errors: {} },
      readCheck: store.read,
      writeCheck: store.write,
      media: async () => MEDIA,
    });
  return { root, missing, create, service: create() };
}

async function settled(service: ReturnType<typeof createLibraryHealthService>) {
  await vi.waitFor(async () => {
    const { job } = await service.overview();
    expect(job?.status).not.toBe("running");
  });
  return service.overview();
}

describe("Library Health check", () => {
  it("doesn't check anything until you ask", async () => {
    const { service } = await fixture([healthy("a")]);
    await expect(service.overview()).resolves.toMatchObject({
      check: null,
      job: null,
    });
  });

  it("records what each damaged Save expected and what it found", async () => {
    const { service, create } = await fixture(
      [
        healthy("a"),
        save("broken", [file("image", "broken.png")]),
        save("arriving", [file("image", "arriving.png")], "ingesting"),
        save("clip", [file("video", "clip.mp4")]),
      ],
      {
        missing: ["broken.png", "arriving.png"],
        index: {
          orphans: ["stray"],
          missing: ["gone"],
          errors: { library: "Backup manifest unreadable", ghost: "bad" },
        },
      },
    );

    expect(service.start().status).toBe("running");
    const { check, job } = await settled(service);

    expect(job).toMatchObject({ status: "completed", processed: 4, total: 4 });
    expect(check?.saves).toBe(4);
    expect(check?.counts["invalid-content"]).toBe(1);
    expect(check?.issues).toEqual([
      expect.objectContaining({
        kind: "invalid-content",
        saveId: "broken",
        originals: "unusable",
        files: [
          {
            path: "broken.png",
            kind: "image",
            expectedSize: 4,
            foundSize: null,
            finding: "missing",
          },
        ],
      }),
    ]);
    expect(check?.posters).toEqual([
      { saveId: "clip", title: "Title clip", videos: 1, posters: 0 },
    ]);
    expect(check?.index).toEqual({
      orphans: ["stray"],
      missing: ["gone"],
      unreadable: ["ghost"],
      backupError: "Backup manifest unreadable",
    });
    await expect(create().overview()).resolves.toMatchObject({
      check: { checkedAt: check?.checkedAt, saves: 4 },
    });
  });

  it("leaves Saves whose download didn't finish to Downloads", async () => {
    const { service } = await fixture(
      [
        healthy("a"),
        save("dead", [], "failed"),
        save("skipped", [], "skipped"),
      ],
      { index: { orphans: [], missing: ["dead", "skipped"], errors: {} } },
    );
    service.start();
    const { check } = await settled(service);
    expect(check?.issues).toEqual([]);
    expect(check?.counts["invalid-content"]).toBe(0);
    expect(check?.index?.missing).toEqual([]);
  });

  it("lists a Save it couldn't read as unverified instead of healthy", async () => {
    const { service } = await fixture([healthy("a"), healthy("locked")], {
      unreadable: ["locked.png"],
    });
    service.start();
    const { check } = await settled(service);
    expect(check?.issues).toEqual([]);
    expect(check?.unverified).toEqual([
      { saveId: "locked", title: "Title locked", reason: "EACCES: locked.png" },
    ]);
    expect(check?.counts.unverified).toBe(1);
  });

  it("keeps the last result when you cancel a check", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { service } = await fixture([healthy("a"), healthy("b")], { gate });
    service.start();
    expect(service.cancel()?.status).toBe("cancelled");
    release();
    const { check, job } = await settled(service);
    expect(job?.status).toBe("cancelled");
    expect(check).toBeNull();
  });

  it("rechecks only the Saves you name and keeps counts exact", async () => {
    const { service, missing } = await fixture(
      [
        save("broken", [file("image", "broken.png")]),
        save("other", [file("image", "other.png")]),
      ],
      {
        missing: ["broken.png", "other.png"],
        index: { orphans: [], missing: ["broken"], errors: {} },
      },
    );
    service.start();
    await settled(service);
    missing.delete("broken.png");

    const next = await service.recheck(["broken"]);

    expect(next?.counts["invalid-content"]).toBe(1);
    expect(
      next?.issues
        .filter((issue) => issue.kind === "invalid-content")
        .map((issue) => issue.saveId),
    ).toEqual(["other"]);
    expect(next?.index?.missing).toEqual([]);
    await expect(service.overview()).resolves.toMatchObject({
      check: { counts: { "invalid-content": 1 } },
    });
  });

  it("caps the stored list but not the count", async () => {
    const rows = Array.from({ length: 2_001 }, (_, index) =>
      save(`s${index}`, [file("image", `s${index}.png`)]),
    );
    const { service } = await fixture(rows, {
      missing: rows.map((row) => `${row.id}.png`),
    });
    service.start();
    const { check } = await settled(service);
    expect(check?.counts["invalid-content"]).toBe(2_001);
    expect(check?.issues).toHaveLength(2_000);
  });
});

describe("Library Health store", () => {
  it("ignores a stored result it can't read", async () => {
    const root = await mkdtemp(join(tmpdir(), "pond-library-health-store-"));
    roots.push(root);
    const store = createLibraryHealthStore(() => root);
    await writeFile(join(root, "library-1.json"), "{ not json", "utf8");
    await expect(store.read("library-1")).resolves.toBeNull();
    await expect(store.read("library-2")).resolves.toBeNull();
  });
});
