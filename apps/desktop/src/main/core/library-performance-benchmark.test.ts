import { execFileSync } from "node:child_process";
import { arch, cpus, platform, release } from "node:os";
import * as schema from "@pond/schema/db";
import * as events from "@pond/schema/events";
import { EMPTY_QUERY } from "@pond/schema/filters";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { expect, it } from "vitest";
import { z } from "zod";
import type { LibraryQueryRequest } from "../../shared/library-query";
import { initializePondSchema } from "../db";
import { queryLibraryIds, queryLibraryPage } from "./library-query";

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

for (const size of [1_000, 10_000, 50_000]) {
  it.skipIf(process.env.POND_BENCH_LIBRARY !== "1")(
    `in-memory Library queries N=${size}`,
    async () => {
      if (!process.versions.electron)
        throw new Error(
          "Run native benchmarks with Electron Node mode; do not rebuild native dependencies.",
        );
      const metadata = environment();
      const sqlite = new Database(":memory:");
      try {
        const setupStarted = performance.now();
        initializePondSchema(sqlite, () => false);
        const statements: Array<{
          sql: string;
          params: (string | number | null)[];
        }> = [];
        let capture = false;
        const db = Object.assign(
          drizzle(sqlite, {
            schema: { ...schema, ...events },
            logger: {
              logQuery(sql, params) {
                if (capture)
                  statements.push({
                    sql,
                    params: z
                      .array(z.union([z.string(), z.number(), z.null()]))
                      .parse(params),
                  });
              },
            },
          }),
          { $raw: sqlite },
        );
        const insert = sqlite.prepare(
          "insert into saves (id, source, source_id, url, title, saved_at, created_at, status, media_type) values (?, 'local', ?, 'pond:test', ?, ?, ?, 'complete', 'text')",
        );
        sqlite.transaction(() => {
          for (let i = 0; i < size; i++)
            insert.run(
              String(i).padStart(6, "0"),
              String(i),
              `${i % 10 === 0 ? "needle" : "reference"} ${String((i * 7919) % size).padStart(6, "0")}`,
              i,
              i,
            );
          sqlite.exec(
            "insert into folders(id,name) values ('broad','Broad'),('selective','Selective'); insert into save_folders(save_id,folder_id) select id,'broad' from saves; insert into save_folders(save_id,folder_id) select id,'selective' from saves where cast(id as integer) % 100 = 0",
          );
        })();
        const setupMs = performance.now() - setupStarted;
        for (const sortKey of ["savedAt", "title"]) {
          for (const pinnedIds of [[], ["000007", "000003", "000001"]]) {
            for (const scope of ["all", "keyword", "selective", "broad"]) {
              const request: LibraryQueryRequest = {
                query: EMPTY_QUERY,
                sortKey,
                sortDir: "desc",
                limit: 250,
              };
              if (scope === "keyword") request.keywords = "needle";
              if (scope === "selective" || scope === "broad")
                request.scope = { folderIds: [scope] };
              const total =
                scope === "keyword"
                  ? size / 10
                  : scope === "selective"
                    ? size / 100
                    : size;
              const first = await queryLibraryPage(
                db,
                "synthetic",
                request,
                [],
                pinnedIds,
              );
              for (const page of ["first", "next"]) {
                // Exhausted scopes have no subsequent page; do not time a repeated first page.
                const cursor = first.nextCursor;
                if (page === "next" && !cursor) continue;
                const times: number[] = [];
                const memoryBefore = process.memoryUsage();
                const deadline = performance.now() + 30_000;
                for (
                  let repetition = 0;
                  repetition < warmups + samples;
                  repetition++
                ) {
                  if (performance.now() > deadline)
                    throw new Error(
                      `Bounded query case exceeded 30s: ${size}/${sortKey}/${scope}/${page}`,
                    );
                  const input =
                    page === "first" ? request : { ...request, cursor };
                  const started = performance.now();
                  const result = await queryLibraryPage(
                    db,
                    "synthetic",
                    input,
                    [],
                    pinnedIds,
                  );
                  const elapsed = performance.now() - started;
                  expect(result.total).toBe(total);
                  expect(result.ids).toHaveLength(
                    Math.min(250, total - (page === "next" ? 250 : 0)),
                  );
                  expect(new Set(result.ids).size).toBe(result.ids.length);
                  if (page === "next")
                    expect(
                      result.ids.some((id) => first.ids.includes(id)),
                    ).toBe(false);
                  if (repetition >= warmups) times.push(elapsed);
                }
                process.stdout.write(
                  `${JSON.stringify({
                    benchmark: "library-query",
                    ...metadata,
                    size,
                    sortKey,
                    pins: pinnedIds.length,
                    scope,
                    page,
                    total,
                    setupMs,
                    fixture:
                      "in-memory SQLite; unchanged between reads; not disk startup",
                    elapsedMs: summary(times),
                    rawElapsedMs: times,
                    processMemoryBytes: {
                      before: memoryBefore,
                      after: process.memoryUsage(),
                    },
                  })}\n`,
                );
              }
            }
          }
        }
        // Diagnostic stage replays are separate from the unchanged baseline timer.
        // Capture production SQL through Drizzle, never an approximate handwritten query.
        if (size === 10_000) {
          for (const sortKey of ["savedAt", "title"]) {
            for (const sortDir of ["asc", "desc"] as const) {
              for (const pins of [[], ["000007", "000003", "000001"]]) {
                for (const scope of ["all", "broad", "selective"]) {
                  const request: LibraryQueryRequest = {
                    query: EMPTY_QUERY,
                    sortKey,
                    sortDir,
                    limit: 25,
                  };
                  if (scope !== "all") request.scope = { folderIds: [scope] };
                  const first = await queryLibraryPage(
                    db,
                    "synthetic",
                    request,
                    [],
                    pins,
                  );
                  for (const queryKind of ["first", "next", "ids"]) {
                    const input =
                      queryKind === "next"
                        ? { ...request, cursor: first.nextCursor }
                        : request;
                    const execute = () =>
                      queryKind === "ids"
                        ? queryLibraryIds(db, "synthetic", input, [], pins)
                        : queryLibraryPage(db, "synthetic", input, [], pins);
                    statements.length = 0;
                    capture = true;
                    await execute();
                    capture = false;
                    expect(statements).toHaveLength(
                      queryKind === "ids" ? 1 : 2,
                    );
                    const plans = statements.map((statement) => ({
                      ...statement,
                      plan: sqlite
                        .prepare(`EXPLAIN QUERY PLAN ${statement.sql}`)
                        .all(...statement.params),
                    }));
                    const elapsed: number[] = [];
                    const stageTimes: number[][] = statements.map(() => []);
                    const deadline = performance.now() + 30_000;
                    for (
                      let repetition = 0;
                      repetition < warmups + samples;
                      repetition++
                    ) {
                      if (performance.now() > deadline)
                        throw new Error(
                          "SQL diagnostic case exceeded 30 seconds",
                        );
                      const start = performance.now();
                      const result = await execute();
                      const duration = performance.now() - start;
                      expect(result.ids).toHaveLength(
                        queryKind === "ids"
                          ? scope === "selective"
                            ? 100
                            : size
                          : 25,
                      );
                      // Prepare outside each timer; replay materialization is raw SQLite,
                      // not Drizzle hydration or an additive breakdown of overall time.
                      for (const [index, statement] of statements.entries()) {
                        const prepared = sqlite.prepare(statement.sql);
                        const started = performance.now();
                        prepared.all(...statement.params);
                        const stageMs = performance.now() - started;
                        if (repetition >= warmups)
                          stageTimes[index]?.push(stageMs);
                      }
                      if (repetition >= warmups) elapsed.push(duration);
                    }
                    process.stdout.write(
                      `${JSON.stringify({
                        benchmark: "library-query-plan",
                        ...metadata,
                        size,
                        sortKey,
                        sortDir,
                        pins: pins.length,
                        scope,
                        queryKind,
                        limit: 25,
                        plans,
                        elapsedMs: summary(elapsed),
                        rawElapsedMs: elapsed,
                        stages: stageTimes.map((times, index) => ({
                          stage:
                            queryKind !== "ids" && index === 0
                              ? "count"
                              : "rows",
                          measurement:
                            "prepared raw SQLite replay, including materialization; outside overall timer",
                          elapsedMs: summary(times),
                          rawElapsedMs: times,
                        })),
                      })}\n`,
                    );
                  }
                }
              }
            }
          }
        }
      } finally {
        sqlite.close();
      }
    },
    300_000,
  );
}
