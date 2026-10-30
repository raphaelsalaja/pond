import { execFileSync } from "node:child_process";
import { arch, cpus, platform, release } from "node:os";
import * as schema from "@pond/schema/db";
import * as events from "@pond/schema/events";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { expect, it } from "vitest";
import { z } from "zod";
import { embeddingDimensions } from "../../shared/embeddings";
import { initializePondSchema } from "../db";
import { retrieveLibraryWithDb } from "./library-retrieval";
import { toVecBlob } from "./vec-index";

interface RetrievalTimings {
  adapter: number[];
  exactSql: number[];
  guardedBlobSql: number[];
}

const warmups = 5;
const samples = 30;
const Neighbors = z.array(z.object({ id: z.string(), distance: z.number() }));
function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p50: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    max: sorted.at(-1),
  };
}
function vector(angle: number) {
  return Array.from({ length: embeddingDimensions() }, (_, i) =>
    i === 0 ? Math.cos(angle) : i === 1 ? Math.sin(angle) : 0,
  );
}

for (const size of [1_000, 10_000, 50_000]) {
  it.skipIf(process.env.POND_BENCH_LIBRARY !== "1")(
    `scoped native vector spike N=${size}`,
    async () => {
      if (!process.versions.electron)
        throw new Error(
          "Electron Node mode is required; do not rebuild native modules",
        );
      const sqlite = new Database(":memory:");
      try {
        const setupStarted = performance.now();
        const workloadDeadline = setupStarted + 550_000;
        expect(initializePondSchema(sqlite)).toBe(true);
        const version = sqlite.prepare("select vec_version() version").get();
        const captured: Array<{
          sql: string;
          params: (string | number | null)[];
        }> = [];
        let capture = false;
        const db = Object.assign(
          drizzle(sqlite, {
            schema: { ...schema, ...events },
            logger: {
              logQuery(sql, params) {
                if (capture && sql.includes("vec_distance_cosine"))
                  captured.push({
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
          "insert into saves(id,source,source_id,url,title,saved_at,status,embedding,embedding_model,clip_embedding,clip_model) values (?,'local',?,'pond:test','Synthetic',?,'complete',?,'fixture-model',?,'fixture-model')",
        );
        const insertText = sqlite.prepare(
          "insert into save_text_vec(save_id,embedding) values (?,?)",
        );
        const insertMedia = sqlite.prepare(
          "insert into save_clip_vec(save_id,embedding) values (?,?)",
        );
        sqlite.transaction(() => {
          sqlite.exec(
            "insert into folders(id,name) values ('broad','Broad'),('ten','Ten percent'),('one','One percent')",
          );
          const folder = sqlite.prepare(
            "insert into save_folders(save_id,folder_id) values (?,?)",
          );
          for (let index = 0; index < size; index++) {
            const id = String(index).padStart(6, "0");
            const values = vector(0.2 + (1.2 * index) / size);
            const json = JSON.stringify(values);
            const blob = toVecBlob(values);
            insert.run(id, id, index, json, json);
            insertText.run(id, blob);
            insertMedia.run(id, blob);
            folder.run(id, "broad");
            if (index % 10 === 0) folder.run(id, "ten");
            if (index % 100 === 0) folder.run(id, "one");
          }
        })();
        const setupMs = performance.now() - setupStarted;
        const metadata = {
          commit: execFileSync("git", ["rev-parse", "HEAD"], {
            encoding: "utf8",
          }).trim(),
          date: new Date().toISOString(),
          node: process.versions.node,
          electron: process.versions.electron,
          os: platform(),
          release: release(),
          architecture: arch(),
          cpu: cpus()[0]?.model,
          sqliteVec: version,
          size,
          dimensions: embeddingDimensions(),
          warmups,
          samples,
          setupMs,
          fixture: "in-memory SQLite, synthetic vectors; no encoder, IPC or UI",
          databaseBytes:
            Number(sqlite.pragma("page_count", { simple: true })) *
            Number(sqlite.pragma("page_size", { simple: true })),
        };
        const query = vector(0);
        const blob = toVecBlob(query);
        for (const channel of ["text", "media"] as const) {
          const table = channel === "text" ? "save_text_vec" : "save_clip_vec";
          const column = channel === "text" ? "embedding" : "clip_embedding";
          const modelColumn =
            channel === "text" ? "embedding_model" : "clip_model";
          for (const [folder, stride] of [
            ["broad", 1],
            ["ten", 10],
            ["one", 100],
          ] as const) {
            const embeddings = {
              [channel]: { model: "fixture-model", vector: query },
            };
            const executeAdapter = () =>
              retrieveLibraryWithDb(
                db,
                { limit: 12 },
                { folderId: folder },
                embeddings,
              );
            captured.length = 0;
            capture = true;
            const initial = await executeAdapter();
            capture = false;
            expect(captured).toHaveLength(1);
            const statement = captured[0];
            if (!statement)
              throw new Error("Expected real adapter distance SQL");
            const exact = sqlite.prepare(statement.sql);
            const eligibleSql = `s.deleted_at is null and s.${modelColumn} = 'fixture-model' and s.${column} is not null and json_array_length(s.${column}) = ${embeddingDimensions()} and exists (select 1 from save_folders f where f.save_id=s.id and f.folder_id=?)`;
            const eligibleCount = size / stride;
            const expected = Array.from(
              { length: Math.min(200, eligibleCount) },
              (_, i) => String(i * stride).padStart(6, "0"),
            );
            expect(initial.hits.map((hit) => hit.id)).toEqual(
              expected.slice(0, 12),
            );
            const exactRows = () =>
              z
                .array(z.tuple([z.string(), z.number()]))
                .parse(exact.raw().all(...statement.params))
                .map(([id, distance]) => ({ id, distance }));
            // Test-only exact candidate: verify every eligible blob against authoritative
            // JSON on each request, then scan scoped blobs with the SAME cosine metric.
            // Missing, stale or different-dimension entries use the exact JSON fallback.
            const invalid = sqlite.prepare(
              `select s.id from saves s left join ${table} v on v.save_id=s.id where ${eligibleSql} and (v.save_id is null or v.embedding != vec_f32(s.${column})) limit 1`,
            );
            const scan = sqlite.prepare(
              `select s.id, vec_distance_cosine(v.embedding, ?) distance from saves s join ${table} v on v.save_id=s.id where ${eligibleSql} order by distance limit 200`,
            );
            const candidate = () =>
              sqlite.transaction(() => {
                if (invalid.get(folder))
                  return { rows: exactRows(), fallback: true };
                return {
                  rows: Neighbors.parse(scan.all(blob, folder)),
                  fallback: false,
                };
              })();
            // Verify IN filtering is applied inside KNN using eligible IDs, not a
            // global top-K/post-filter. L2 here is capability evidence, NOT the candidate.
            const scopedKnn = Neighbors.parse(
              sqlite
                .prepare(
                  `select save_id id, distance from ${table} where embedding match ? and k=? and save_id in (select s.id from saves s where ${eligibleSql})`,
                )
                .all(blob, Math.min(200, eligibleCount), folder),
            );
            expect(scopedKnn.map((row) => row.id)).toEqual(expected);
            const timings: RetrievalTimings = {
              adapter: [],
              exactSql: [],
              guardedBlobSql: [],
            };
            const phases: Array<{
              name: "adapter" | "exactSql" | "guardedBlobSql";
              status: "complete" | "bounded-timeout";
              completedWarmups: number;
              completedSamples: number;
            }> = [];
            const memoryBefore = process.memoryUsage();
            const reference = exactRows();
            expect(reference.map((row) => row.id)).toEqual(expected);
            for (const name of [
              "adapter",
              "exactSql",
              "guardedBlobSql",
            ] as const) {
              // Independent phase budgets prevent the rejected prototype from
              // consuming the current path's measurement window.
              const deadline = Math.min(
                performance.now() + 120_000,
                workloadDeadline,
              );
              let completed = 0;
              for (
                let repetition = 0;
                repetition < warmups + samples;
                repetition++
              ) {
                if (performance.now() >= deadline) break;
                const started = performance.now();
                if (name === "adapter") {
                  const result = await executeAdapter();
                  const elapsed = performance.now() - started;
                  expect(result.hits.map((hit) => hit.id)).toEqual(
                    expected.slice(0, 12),
                  );
                  if (repetition >= warmups) timings[name].push(elapsed);
                } else if (name === "exactSql") {
                  const result = exactRows();
                  const elapsed = performance.now() - started;
                  expect(result.map((row) => row.id)).toEqual(expected);
                  if (repetition >= warmups) timings[name].push(elapsed);
                } else {
                  const proposed = candidate();
                  const elapsed = performance.now() - started;
                  expect(proposed.rows.map((row) => row.id)).toEqual(expected);
                  expect(proposed.fallback).toBe(false);
                  for (const [index, row] of proposed.rows.entries())
                    expect(row.distance).toBeCloseTo(
                      reference[index]?.distance ?? -1,
                      6,
                    );
                  if (repetition >= warmups) timings[name].push(elapsed);
                }
                completed++;
              }
              phases.push({
                name,
                status:
                  completed === warmups + samples &&
                  performance.now() <= deadline
                    ? "complete"
                    : "bounded-timeout",
                completedWarmups: Math.min(completed, warmups),
                completedSamples: timings[name].length,
              });
            }
            // Prove fallback for both missing and stale entries, outside timed regions.
            const first = expected[0];
            if (!first) throw new Error("Expected eligible fixture");
            sqlite.prepare(`delete from ${table} where save_id=?`).run(first);
            const missing = candidate();
            expect(missing.fallback).toBe(true);
            expect(missing.rows.map((row) => row.id)).toEqual(expected);
            sqlite
              .prepare(`insert into ${table}(save_id,embedding) values (?,?)`)
              .run(first, toVecBlob(vector(1.5)));
            const stale = candidate();
            expect(stale.fallback).toBe(true);
            expect(stale.rows.map((row) => row.id)).toEqual(expected);
            sqlite.prepare(`delete from ${table} where save_id=?`).run(first);
            sqlite
              .prepare(`insert into ${table}(save_id,embedding) values (?,?)`)
              .run(first, toVecBlob(vector(0.2)));
            process.stdout.write(
              `${JSON.stringify({
                benchmark: "vector-retrieval-spike",
                ...metadata,
                channel,
                folder,
                eligibleCount,
                internalK: 200,
                resultLimit: 12,
                prototype:
                  "test-only scoped exact cosine blob scan with per-request completeness/freshness verification and JSON fallback; not KNN",
                scopedKnnCapability:
                  "TEXT primary key IN subquery accepted; L2 parity only on this normalized fixture, not a general cosine proof",
                phases,
                phaseBudgetMs: 120_000,
                workloadBudgetMs: 550_000,
                adapterMs:
                  phases[0]?.status === "complete"
                    ? summary(timings.adapter)
                    : null,
                exactSqlMs:
                  phases[1]?.status === "complete"
                    ? summary(timings.exactSql)
                    : null,
                guardedBlobSqlMs:
                  phases[2]?.status === "complete"
                    ? summary(timings.guardedBlobSql)
                    : null,
                rawElapsedMs: timings,
                processMemoryBytes: {
                  before: memoryBefore,
                  after: process.memoryUsage(),
                },
                fallbackChecks: { missing: true, stale: true },
              })}\n`,
            );
          }
        }
      } finally {
        sqlite.close();
      }
    },
    600_000,
  );
}
