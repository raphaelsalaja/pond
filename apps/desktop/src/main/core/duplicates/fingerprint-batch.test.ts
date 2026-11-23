import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { migratePond } from "../../database/migrations";
import { ensureAssetIndex } from "./asset-index";
import { runFingerprintBatch } from "./fingerprint-batch";
import type { FingerprintOutcome } from "./fingerprint-compute";
import {
  deleteOrphanFingerprints,
  FINGERPRINT_ALGORITHMS,
  fingerprintIndexStatus,
  loadFingerprints,
  MAX_ATTEMPTS,
  nextFingerprintJobs,
  recordFingerprint,
} from "./fingerprints";

function nativeSqliteAvailable(): boolean {
  try {
    new Database(":memory:").close();
    return true;
  } catch (error) {
    if (process.versions.electron) throw error;
    return false;
  }
}

const sha = (seed: string) => seed.padEnd(64, "0");
const HOUR = 60 * 60_000;

const RowSchema = z.object({
  sha256: z.string(),
  status: z.string(),
  attempts: z.number(),
});

describe.skipIf(!nativeSqliteAvailable())("fingerprint batches", () => {
  let root: string;
  let db: Database.Database;
  let clock: number;

  function addSave(
    id: string,
    files: Array<{ path: string; seed: string; bytes?: number; size?: number }>,
  ) {
    mkdirSync(join(root, id), { recursive: true });
    for (const item of files)
      if (item.bytes !== undefined)
        writeFileSync(join(root, id, item.path), Buffer.alloc(item.bytes, 1));
    db.prepare(
      "INSERT INTO saves (id, source, source_id, url, files) VALUES (?, 'local', ?, '', ?)",
    ).run(
      id,
      id,
      JSON.stringify(
        files.map((item) => ({
          path: item.path,
          kind: "image",
          sha256: sha(item.seed),
          size: item.size ?? item.bytes ?? 4,
        })),
      ),
    );
  }

  function rows() {
    return z
      .array(RowSchema)
      .parse(
        db
          .prepare(
            "SELECT sha256, status, attempts FROM asset_fingerprints ORDER BY sha256",
          )
          .all(),
      );
  }

  function run(compute: (path: string) => FingerprintOutcome) {
    return runFingerprintBatch(db, {
      resolvePath: (id, path) => join(root, id, path),
      compute: async (_, path) => compute(path),
      now: () => clock,
    });
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "pond-fingerprints-"));
    db = new Database(":memory:");
    migratePond(db);
    ensureAssetIndex(db);
    clock = 1_000_000;
  });

  afterEach(() => {
    db.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("classifies first, prints each hash once, then goes idle", async () => {
    addSave("one", [{ path: "a.png", seed: "a", bytes: 4 }]);
    addSave("two", [{ path: "copy.png", seed: "a", bytes: 4 }]);
    addSave("three", [{ path: "b.png", seed: "b", bytes: 4 }]);
    const computed: string[] = [];
    const ok = (path: string): FingerprintOutcome => {
      computed.push(path);
      return { status: "ok", value: new Uint8Array(16).fill(1) };
    };
    expect(await run(ok)).toEqual({ state: "classified", count: 3 });
    expect(fingerprintIndexStatus(db)).toMatchObject({ assets: 2, pending: 2 });
    expect(await run(ok)).toEqual({ state: "fingerprinted", count: 2 });
    expect(computed).toHaveLength(2);
    expect(await run(ok)).toEqual({ state: "idle" });
    expect(fingerprintIndexStatus(db)).toEqual({
      assets: 2,
      fingerprinted: 2,
      pending: 0,
      failed: 0,
    });
    expect([...loadFingerprints(db).image.keys()].sort()).toEqual([
      sha("a"),
      sha("b"),
    ]);
  });

  it("records missing and changed files without computing them", async () => {
    addSave("gone", [{ path: "a.png", seed: "a" }]);
    addSave("changed", [{ path: "b.png", seed: "b", bytes: 8, size: 4 }]);
    let calls = 0;
    await run(() => ({ status: "ok" }));
    await run(() => {
      calls += 1;
      return { status: "ok" };
    });
    expect(calls).toBe(0);
    expect(rows()).toEqual([
      { sha256: sha("a"), status: "missing", attempts: 1 },
      { sha256: sha("b"), status: "missing", attempts: 1 },
    ]);
  });

  it("backs off failures and gives up after the last attempt", async () => {
    addSave("one", [{ path: "a.png", seed: "a", bytes: 4 }]);
    await run(() => ({ status: "ok" }));
    const fail = (): FingerprintOutcome => {
      throw new Error("decoder crashed");
    };
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      expect(await run(fail)).toEqual({ state: "fingerprinted", count: 1 });
      expect(rows()[0]).toMatchObject({ status: "failed", attempts: attempt });
      expect(await run(fail)).toEqual({ state: "idle" });
      clock += HOUR;
    }
    expect(await run(fail)).toEqual({ state: "idle" });
    expect(fingerprintIndexStatus(db)).toMatchObject({ pending: 0, failed: 1 });
  });

  it("reprints a hash whose algorithm version changed", () => {
    addSave("one", [{ path: "a.png", seed: "a", bytes: 4 }]);
    db.prepare("UPDATE save_assets SET media = 'image'").run();
    recordFingerprint(db, {
      sha256: sha("a"),
      algorithm: { ...FINGERPRINT_ALGORITHMS.image, version: 0 },
      status: "ok",
      value: new Uint8Array(16),
      now: clock,
    });
    const jobs = nextFingerprintJobs(db, 10, clock);
    expect(jobs.map((job) => job.sha256)).toEqual([sha("a")]);
    expect(loadFingerprints(db).image.size).toBe(0);
  });

  it("drops prints only once no Save holds the content", async () => {
    addSave("one", [{ path: "a.png", seed: "a", bytes: 4 }]);
    await run(() => ({ status: "ok" }));
    await run(() => ({ status: "ok", value: new Uint8Array(16) }));
    db.prepare("UPDATE saves SET deleted_at = 1 WHERE id = 'one'").run();
    expect(deleteOrphanFingerprints(db)).toBe(0);
    db.prepare("DELETE FROM saves WHERE id = 'one'").run();
    expect(deleteOrphanFingerprints(db)).toBe(1);
  });
});
