import { execFileSync } from "node:child_process";
import { arch, cpus, platform, release } from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { pool, savesStore } from "../state/pool";
import { bulkMutation } from "./mutate";
import { normalise } from "./reconcile";

const warmups = 5;
const samples = 30;
function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    max: sorted.at(-1),
  };
}
function environment() {
  return {
    commit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    node: process.versions.node,
    electron: process.versions.electron ?? null,
    os: platform(),
    release: release(),
    architecture: arch(),
    cpu: cpus()[0]?.model,
    date: new Date().toISOString(),
    warmups,
    samples,
  };
}

afterEach(() => {
  pool.clear();
  vi.unstubAllGlobals();
});

for (const size of [1_000, 10_000, 50_000]) {
  for (const count of [1, 100, 1_000]) {
    for (const kind of ["rating", "trash", "purge", "rollback"] as const) {
      it.skipIf(process.env.POND_BENCH_LIBRARY !== "1")(
        `bulk ${kind} N=${size} K=${count}`,
        async () => {
          const metadata = environment();
          const fixtureStarted = performance.now();
          const saves = Array.from({ length: size }, (_, i) => {
            const save = normalise({
              id: String(i).padStart(6, "0"),
              source: "local",
              title: `Synthetic ${i}`,
              savedAt: i,
              createdAt: i,
              deletedAt: null,
            });
            if (!save) throw new Error("Invalid synthetic Save");
            return save;
          });
          const fixtureMs = performance.now() - fixtureStarted;
          const ids = saves.slice(0, count).map((save) => save.id);
          const elapsed: number[] = [];
          const resets: number[] = [];
          const publications: number[] = [];
          const optimisticPublications: number[] = [];
          const memoryBefore = process.memoryUsage();
          const deadline = performance.now() + 90_000;
          for (
            let repetition = 0;
            repetition < warmups + samples;
            repetition++
          ) {
            if (performance.now() > deadline)
              throw new Error(
                `Bounded bulk case exceeded 90s: ${size}/${count}/${kind}`,
              );
            const resetStarted = performance.now();
            pool.clear();
            pool.bulkUpsert(saves);
            const resetMs = performance.now() - resetStarted;
            const pending = Promise.withResolvers<{ changed: number }>();
            const query = vi.fn((name: string) =>
              name === "saves.bulkEdit"
                ? pending.promise
                : Promise.resolve(undefined),
            );
            vi.stubGlobal("window", { pond: { query } });
            let published = 0;
            const subscription = savesStore.subscribe(() => {
              published++;
            });
            try {
              const operation =
                kind === "rating" || kind === "rollback"
                  ? ({ kind: "rating", rating: 3 } as const)
                  : { kind };
              const started = performance.now();
              const mutation = bulkMutation(ids, operation);
              const optimisticCount = published;
              // Attach the rejection observer before rejecting the injected bridge.
              const settled = mutation.then(
                (changed) => ({ changed, rejected: false }),
                () => ({ changed: 0, rejected: true }),
              );
              if (kind === "rollback")
                pending.reject(new Error("Synthetic rejection"));
              else pending.resolve({ changed: count });
              const result = await settled;
              const duration = performance.now() - started;
              expect(result).toEqual({
                changed: kind === "rollback" ? 0 : count,
                rejected: kind === "rollback",
              });
              expect(pool.snapshot()).toHaveLength(
                kind === "purge" ? size - count : size,
              );
              for (const id of ids) {
                if (kind === "purge") expect(pool.get(id)).toBeUndefined();
                else if (kind === "rating")
                  expect(pool.get(id)?.rating).toBe(3);
                else if (kind === "trash")
                  expect(pool.get(id)?.deletedAt).toBeGreaterThan(0);
                else expect(pool.get(id)?.rating).toBeNull();
              }
              expect(query).toHaveBeenCalledWith("saves.bulkEdit", {
                ids,
                operation,
              });
              expect(optimisticCount).toBe(1);
              expect(published).toBe(kind === "rollback" ? 2 : 1);
              if (repetition >= warmups) {
                elapsed.push(duration);
                resets.push(resetMs);
                publications.push(published);
                optimisticPublications.push(optimisticCount);
              }
            } finally {
              subscription.unsubscribe();
            }
          }
          process.stdout.write(
            `${JSON.stringify({
              benchmark: "bulk-pool",
              ...metadata,
              size,
              count,
              kind,
              fixture:
                "in-memory pool; injected bridge; no DOM, IPC, persistence or rendering",
              fixtureMs,
              resetMs: summary(resets),
              elapsedMs: summary(elapsed),
              rawElapsedMs: elapsed,
              publications,
              optimisticPublications,
              processMemoryBytes: {
                before: memoryBefore,
                after: process.memoryUsage(),
              },
            })}\n`,
          );
        },
        100_000,
      );
    }
  }
}
