import { execFileSync } from "node:child_process";
import { arch, cpus, platform, release } from "node:os";
import type { BulkEdit, BulkQueryResults } from "@shared/bulk-contracts";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { pool, savesStore } from "../state/pool";
import { bulkMutation } from "./mutate";
import { normalise } from "./reconcile";

type Kind = "rating" | "trash" | "purge" | "rollback";

const warmups = 5;
const samples = 30;
function summary(values: Array<number>) {
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

const applied: Record<Kind, (id: string) => boolean> = {
  rating: (id) => pool.get(id)?.rating === 3,
  trash: (id) => (pool.get(id)?.deletedAt ?? 0) > 0,
  purge: (id) => pool.get(id) === undefined,
  rollback: (id) => pool.get(id)?.rating === null,
};

afterEach(() => {
  pool.clear();
});

describe.skipIf(process.env.POND_BENCH_LIBRARY !== "1")("bulk pool", () => {
  let metadata: ReturnType<typeof environment>;

  beforeAll(() => {
    metadata = environment();
  });

  for (const size of [1000, 10_000, 50_000]) {
    for (const count of [1, 100, 1000]) {
      for (const kind of ["rating", "trash", "purge", "rollback"] as const) {
        it(
          `bulk ${kind} N=${size} K=${count}`,
          async () => {
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
              if (!save) {
                throw new Error("Invalid synthetic Save");
              }
              return save;
            });
            const fixtureMs = performance.now() - fixtureStarted;
            const ids = saves.slice(0, count).map((save) => save.id);
            const elapsed: Array<number> = [];
            const resets: Array<number> = [];
            const publications: Array<number> = [];
            const optimisticPublications: Array<number> = [];
            const memoryBefore = process.memoryUsage();
            const deadline = performance.now() + 90_000;
            for (
              let repetition = 0;
              repetition < warmups + samples;
              repetition++
            ) {
              if (performance.now() > deadline) {
                throw new Error(
                  `Bounded bulk case exceeded 90s: ${size}/${count}/${kind}`,
                );
              }
              const resetStarted = performance.now();
              pool.clear();
              pool.bulkUpsert(saves);
              const resetMs = performance.now() - resetStarted;
              const pending =
                Promise.withResolvers<BulkQueryResults["saves.bulkEdit"]>();
              const sent: Array<BulkEdit> = [];
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
                const mutation = bulkMutation(
                  ids,
                  operation,
                  {},
                  {
                    bulkEdit: (input) => {
                      sent.push(input);
                      return pending.promise;
                    },
                    onDeletion: () => {},
                  },
                );
                const optimisticCount = published;
                /** Attaches the rejection observer before the injected bulk edit rejects. */
                const settled = mutation.then(
                  ({ changed }) => ({ changed, rejected: false }),
                  () => ({ changed: 0, rejected: true }),
                );
                if (kind === "rollback") {
                  pending.reject(new Error("Synthetic rejection"));
                } else {
                  pending.resolve({ changed: count, undoId: null });
                }
                const result = await settled;
                const duration = performance.now() - started;
                expect(result).toEqual({
                  changed: kind === "rollback" ? 0 : count,
                  rejected: kind === "rollback",
                });
                expect(pool.snapshot()).toHaveLength(
                  kind === "purge" ? size - count : size,
                );
                expect(ids.filter((id) => !applied[kind](id))).toEqual([]);
                expect(sent).toEqual([{ ids, operation }]);
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
                  "in-memory pool; injected bulk edit; no DOM, IPC, persistence or rendering",
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
});
