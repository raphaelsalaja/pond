import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { app } from "electron";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { closeDb, getDb } from "../../db";
import { invalidatePaths, resolvePaths } from "../../paths";
import { POLL_INTERVAL_MS } from "./reconciler-config";
import { claimDueTasks, releaseWebHostWaiter } from "./task-queue";
import { MAX_INFLIGHT_PER_WEB_HOST } from "./web-host-slots";

function nativeSqliteAvailable(): boolean {
  try {
    new Database(":memory:").close();
    return true;
  } catch (error) {
    if (process.versions.electron) throw error;
    return false;
  }
}

async function seedWebHarvest(
  id: string,
  url: string,
  createdAt: number,
  status = "pending",
): Promise<void> {
  const { $raw } = await getDb();
  $raw
    .prepare(
      `INSERT INTO saves (id, source, source_id, url, status)
      VALUES (?, 'web', ?, ?, 'ingesting')`,
    )
    .run(id, id, url);
  $raw
    .prepare(
      `INSERT INTO tasks (
        id, save_id, source, op, status, max_attempts, next_run_at, created_at
      ) VALUES (?, ?, 'web', 'harvest_metadata', ?, 5, ?, ?)`,
    )
    .run(`task-${id}`, id, status, createdAt, createdAt);
}

function claim(limit: number) {
  return claimDueTasks({
    owner: "test",
    limit,
    availableInteractive: 0,
    availableBackground: limit,
    availableByOp: { harvest_metadata: limit },
  });
}

describe.skipIf(!nativeSqliteAvailable())("web harvest per-host limit", () => {
  let directory = "";

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "pond-web-host-claims-"));
    app.setPath("userData", directory);
    invalidatePaths();
    resolvePaths(join(directory, "Hosts.pond"));
  });

  afterEach(() => {
    closeDb();
    invalidatePaths();
    rmSync(directory, { recursive: true, force: true });
  });

  it("spreads a bulk refresh across sites instead of one storefront", async () => {
    const at = Date.now() - 60_000;
    for (let index = 0; index < 9; index++) {
      await seedWebHarvest(
        `shop-${index}`,
        `https://balolo.de/products/${index}`,
        at + index,
      );
    }
    await seedWebHarvest("other", "https://example.com/post", at + 100);

    const claimed = await claim(4);

    expect(claimed.map((task) => task.saveId)).toEqual([
      "shop-0",
      "shop-1",
      "other",
    ]);
    const { $raw } = await getDb();
    expect(
      $raw
        .prepare(
          `SELECT DISTINCT status, deferred_reason AS reason FROM tasks
          WHERE save_id LIKE 'shop-%' AND status != 'running'`,
        )
        .all(),
    ).toEqual([{ status: "deferred", reason: "worker_capacity" }]);
  });

  it("counts work already running for the host", async () => {
    const at = Date.now() - 60_000;
    for (let index = 0; index < MAX_INFLIGHT_PER_WEB_HOST; index++) {
      await seedWebHarvest(
        `running-${index}`,
        `https://www.balolo.de/products/${index}`,
        at,
        "running",
      );
    }
    await seedWebHarvest("waiting", "https://balolo.de/products/x", at + 1);

    const before = Date.now();
    expect(await claim(1)).toEqual([]);

    const { $raw } = await getDb();
    const row = z
      .object({ status: z.string(), nextRunAt: z.number() })
      .parse(
        $raw
          .prepare(
            "SELECT status, next_run_at AS nextRunAt FROM tasks WHERE id = 'task-waiting'",
          )
          .get(),
      );
    expect(row.status).toBe("deferred");
    expect(row.nextRunAt).toBeGreaterThanOrEqual(before + POLL_INTERVAL_MS);
  });

  it("claims the host again once its running work finishes", async () => {
    const at = Date.now() - 60_000;
    await seedWebHarvest("first", "https://balolo.de/a", at);
    await seedWebHarvest("second", "https://balolo.de/b", at + 1);
    await seedWebHarvest("third", "https://balolo.de/c", at + 2);

    expect((await claim(4)).map((task) => task.saveId)).toEqual([
      "first",
      "second",
    ]);

    const { $raw } = await getDb();
    $raw
      .prepare(
        `UPDATE tasks SET status = 'done' WHERE save_id IN ('first', 'second')`,
      )
      .run();
    $raw
      .prepare("UPDATE tasks SET next_run_at = ? WHERE id = 'task-third'")
      .run(at);

    expect((await claim(4)).map((task) => task.saveId)).toEqual(["third"]);
  });

  it("lets the next task for a host run as soon as one of its slots frees", async () => {
    const at = Date.now() - 60_000;
    await seedWebHarvest("first", "https://balolo.de/a", at);
    await seedWebHarvest("second", "https://balolo.de/b", at + 1);
    await seedWebHarvest("third", "https://balolo.de/c", at + 2);
    await seedWebHarvest("fourth", "https://balolo.de/d", at + 3);
    await seedWebHarvest("elsewhere-1", "https://example.com/a", at + 4);
    await seedWebHarvest("elsewhere-2", "https://example.com/b", at + 5);

    expect((await claim(8)).map((task) => task.saveId).toSorted()).toEqual([
      "elsewhere-1",
      "elsewhere-2",
      "first",
      "second",
    ]);

    const { $raw } = await getDb();
    $raw
      .prepare("UPDATE tasks SET status = 'done' WHERE save_id = 'first'")
      .run();
    expect(
      await releaseWebHostWaiter({ saveId: "first", op: "harvest_metadata" }),
    ).toBe(true);

    expect((await claim(8)).map((task) => task.saveId)).toEqual(["third"]);
    const fourth = z
      .object({ status: z.string(), reason: z.string().nullable() })
      .parse(
        $raw
          .prepare(
            "SELECT status, deferred_reason AS reason FROM tasks WHERE id = 'task-fourth'",
          )
          .get(),
      );
    expect(fourth).toEqual({ status: "deferred", reason: "worker_capacity" });
  });

  it("releases nothing for work with no per-host limit", async () => {
    const at = Date.now() - 60_000;
    await seedWebHarvest("first", "https://balolo.de/a", at);
    const { $raw } = await getDb();
    $raw
      .prepare("UPDATE saves SET source = 'twitter' WHERE id = 'first'")
      .run();
    expect(
      await releaseWebHostWaiter({ saveId: "first", op: "harvest_metadata" }),
    ).toBe(false);
  });
});
