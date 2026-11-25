import { EMPTY_QUERY } from "@pond/schema/filters";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { expect, it } from "vitest";
import { eventTables, libraryTables } from "../database/tables";
import { initializePondSchema } from "../db";
import { queryLibraryPage } from "./library-query";
import { querySidebarCounts } from "./sidebar-counts";

/**
 * Real `saves` rows carry raw JSON and two 768-dimension embeddings as text, stored before
 * `status`, `deleted_at` and `saved_at`. Counts that read those columns from the table walk
 * every row's overflow pages, which the narrow rows in the Library benchmark never show.
 */
const benchmarking = process.env.POND_BENCH_LIBRARY === "1";
const warmups = 3;
const samples = 15;

function embedding(seed: number): string {
  return JSON.stringify(
    Array.from({ length: 768 }, (_, i) => Math.sin(seed + i).toFixed(6)),
  );
}

function wideLibrary(size: number) {
  const sqlite = new Database(":memory:");
  initializePondSchema(sqlite, () => false);
  const db = Object.assign(
    drizzle(sqlite, { schema: { ...libraryTables, ...eventTables } }),
    { $raw: sqlite },
  );
  const raw = JSON.stringify({ capture: { text: "x".repeat(4000) } });
  const vector = embedding(1);
  const insert = sqlite.prepare(
    `insert into saves (id, source, source_id, account_id, url, title, raw_json, embedding, clip_embedding,
      tags, saved_at, created_at, status, deleted_at, inbox_state, media_type)
     values (?, ?, ?, ?, 'pond:test', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'image')`,
  );
  sqlite.transaction(() => {
    for (let i = 0; i < size; i++) {
      const id = String(i).padStart(7, "0");
      insert.run(
        id,
        i % 2 === 0 ? "twitter" : "instagram",
        id,
        i % 2 === 0 ? "account-a" : "account-b",
        `reference ${i}`,
        raw,
        vector,
        vector,
        i % 3 === 0 ? "[]" : '["design"]',
        i,
        i,
        i % 200 === 0 ? "ingesting" : "complete",
        i % 50 === 0 ? i : null,
        i % 40 === 0 ? "review" : null,
      );
    }
    sqlite.exec(`
      insert into folders(id,name) values ('broad','Broad'),('selective','Selective'),('child','Child');
      update folders set parent_id='broad' where id='child';
      insert into save_folders(save_id,folder_id) select id,'broad' from saves where cast(id as integer) % 2 = 0;
      insert into save_folders(save_id,folder_id) select id,'child' from saves where cast(id as integer) % 7 = 0;
      insert into save_folders(save_id,folder_id) select id,'selective' from saves where cast(id as integer) % 100 = 0;
    `);
  })();
  sqlite.exec("analyze");
  return { sqlite, db };
}

interface Timing {
  p50: number;
  p95: number;
}

function time(run: () => void): Timing {
  for (let i = 0; i < warmups; i++) run();
  const values: Array<number> = [];
  for (let i = 0; i < samples; i++) {
    const started = performance.now();
    run();
    values.push(performance.now() - started);
  }
  values.sort((a, b) => a - b);
  return {
    p50: Number(values[Math.ceil(values.length * 0.5) - 1]?.toFixed(2)),
    p95: Number(values[Math.ceil(values.length * 0.95) - 1]?.toFixed(2)),
  };
}

for (const size of [20_000, 50_000]) {
  it.skipIf(!benchmarking)(
    `wide-row counts N=${size}`,
    async () => {
      if (!process.versions.electron) {
        throw new Error("Run native benchmarks with Electron Node mode.");
      }
      const { sqlite, db } = wideLibrary(size);
      try {
        const counts = querySidebarCounts(db);
        expect(counts.library).toBeGreaterThan(0);
        const request = {
          query: EMPTY_QUERY,
          sortKey: "savedAt",
          sortDir: "desc" as const,
          limit: 250,
        };
        const first = await queryLibraryPage(db, "bench", request, [], []);
        const accountCount = sqlite.prepare(
          "select count(*) as n from saves where source = 'twitter' and (account_id = 'account-a' or account_id is null) and deleted_at is null",
        );
        const results = {
          sidebarCounts: time(() => {
            querySidebarCounts(db);
          }),
          firstPage: time(() => {
            void queryLibraryPage(db, "bench", request, [], []);
          }),
          nextPage: time(() => {
            void queryLibraryPage(
              db,
              "bench",
              { ...request, cursor: first.nextCursor },
              [],
              [],
            );
          }),
          inboxPage: time(() => {
            void queryLibraryPage(
              db,
              "bench",
              { ...request, scope: { inbox: "review" } },
              [],
              [],
            );
          }),
          accountCount: time(() => {
            accountCount.get();
          }),
        };
        process.stdout.write(
          `${JSON.stringify({ benchmark: "wide-row-counts", size, results })}\n`,
        );
      } finally {
        sqlite.close();
      }
    },
    300_000,
  );
}
