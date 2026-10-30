import * as schema from "@pond/schema/db";
import * as events from "@pond/schema/events";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it } from "vitest";
import { embeddingDimensions } from "../../shared/embeddings";
import { initializePondSchema } from "../db";
import {
  type LibraryRetrievalInput,
  type LibraryRetrievalScope,
  retrieveLibraryWithDb,
} from "./library-retrieval";
import { cosineSimilarity } from "./query-embeddings";
import { upsertVec } from "./vec-index";

function nativeAvailable() {
  try {
    const db = new Database(":memory:");
    db.close();
    return true;
  } catch (error) {
    if (process.versions.electron || process.env.POND_REQUIRE_NATIVE === "1")
      throw error;
    return false;
  }
}
function vector(angle: number) {
  return Array.from({ length: embeddingDimensions() }, (_, i) =>
    i === 0 ? Math.cos(angle) : i === 1 ? Math.sin(angle) : 0,
  );
}
const cases: Array<{
  name: string;
  input: LibraryRetrievalInput;
  scope: LibraryRetrievalScope;
  eligible: (index: number) => boolean;
}> = [
  { name: "broad", input: {}, scope: {}, eligible: () => true },
  {
    name: "folder",
    input: {},
    scope: { folderId: "selective" },
    eligible: (i) => i % 5 === 0,
  },
  {
    name: "source and media",
    input: { source: "local", media: ["image"] },
    scope: {},
    eligible: (i) => i % 3 !== 0,
  },
  {
    name: "web projected link",
    input: { source: "web", media: ["link"] },
    scope: {},
    eligible: (i) => i % 3 === 0,
  },
  {
    name: "empty attachments",
    input: {},
    scope: { saveIds: [] },
    eligible: () => false,
  },
  {
    name: "fewer than K",
    input: { limit: 12 },
    scope: { saveIds: ["s1", "s2"] },
    eligible: (i) => i === 1 || i === 2,
  },
  {
    name: "excluded visual probe",
    input: { visual: { kind: "saveId", id: "s1" } },
    scope: {},
    eligible: (i) => i !== 1,
  },
];

describe.skipIf(!nativeAvailable())("native scoped retrieval adapter", () => {
  for (const channel of ["text", "media"] as const) {
    for (const testCase of cases) {
      it(`${channel}: ${testCase.name}, model/dimension guards and incomplete vector table`, async () => {
        const sqlite = new Database(":memory:");
        try {
          expect(initializePondSchema(sqlite)).toBe(true);
          const db = Object.assign(
            drizzle(sqlite, { schema: { ...schema, ...events } }),
            { $raw: sqlite },
          );
          const records = Array.from({ length: 40 }, (_, index) => ({
            index,
            id: `s${index}`,
            values: index % 13 === 0 ? [1, 0] : vector(0.2 + index / 40),
            model: index % 7 === 0 ? "other-model" : "fixture-model",
            absent: index % 11 === 0,
            deleted: index % 17 === 0,
          }));
          const insert = sqlite.prepare(
            "insert into saves(id,source,source_id,url,title,media_type,saved_at,status,deleted_at,embedding,embedding_model,clip_embedding,clip_model) values (?,?,?,'pond:test','Synthetic','image',?,'complete',?,?,?,?,?)",
          );
          sqlite.transaction(() => {
            sqlite.exec(
              "insert into folders(id,name) values ('selective','Selective')",
            );
            for (const record of records) {
              const encoded = record.absent
                ? null
                : JSON.stringify(record.values);
              insert.run(
                record.id,
                record.index % 3 === 0 ? "web" : "local",
                record.id,
                record.index,
                record.deleted ? 1 : null,
                encoded,
                record.model,
                encoded,
                record.model,
              );
              if (record.index % 5 === 0)
                sqlite
                  .prepare(
                    "insert into save_folders(save_id,folder_id) values (?,'selective')",
                  )
                  .run(record.id);
            }
          })();
          // Most entries are missing; the one present is deliberately stale.
          // The real adapter must still rank authoritative JSON, not the vec table.
          upsertVec(
            sqlite,
            channel === "text" ? "text" : "clip",
            "s1",
            vector(1.5),
          );
          const query = vector(0);
          const expected = records
            .filter(
              (record) =>
                !record.deleted &&
                !record.absent &&
                record.model === "fixture-model" &&
                record.values.length === query.length &&
                testCase.eligible(record.index),
            )
            .sort(
              (a, b) =>
                (cosineSimilarity(b.values, query) ?? -1) -
                (cosineSimilarity(a.values, query) ?? -1),
            )
            .slice(0, testCase.input.limit ?? 12)
            .map((record) => record.id);
          const result = await retrieveLibraryWithDb(
            db,
            testCase.input,
            testCase.scope,
            { [channel]: { model: "fixture-model", vector: query } },
          );
          expect(result.hits.map((hit) => hit.id)).toEqual(expected);
          expect(result.saves.map((save) => save.id)).toEqual(expected);
          for (const hit of result.hits)
            expect(hit.channels).toEqual([channel]);
          const missingModel = await retrieveLibraryWithDb(
            db,
            {},
            {},
            { [channel]: { model: "absent-model", vector: query } },
          );
          expect(missingModel.hits).toEqual([]);
          const missingDimension = await retrieveLibraryWithDb(
            db,
            {},
            {},
            { [channel]: { model: "fixture-model", vector: [1, 0, 0] } },
          );
          expect(missingDimension.hits).toEqual([]);
        } finally {
          sqlite.close();
        }
      });
    }
  }
});
