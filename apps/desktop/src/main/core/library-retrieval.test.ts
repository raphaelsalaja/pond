import type { SQL } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { describe, expect, it, vi } from "vitest";
import {
  normalizeMedia,
  retrieveLibraryWithStore,
  toFtsMatchQuery,
} from "./library-retrieval";
import type { RetrievalRecord, RetrievalStore } from "./library-retrieval";

const dialect = new SQLiteSyncDialect();

function fakeDb(input: {
  candidates?: Array<{ id: string; rank: number }>;
  knnClip?: Array<{ id: string; distance: number }>;
  knnText?: Array<{ id: string; distance: number }>;
  rows?: Array<RetrievalRecord>;
}) {
  const where = vi.fn<(condition: SQL | undefined) => void>();
  const neighborLimits: Array<number> = [];
  const rows = input.rows ?? [];
  const db: RetrievalStore = {
    records: async (condition) => {
      where(condition);
      return rows;
    },
    admittedIds: async (condition) => {
      where(condition);
      return rows.map(({ id }) => ({ id }));
    },
    lexicalCandidates: () => input.candidates ?? [],
    neighbors: (kind, _vector, limit) => {
      neighborLimits.push(limit);
      return kind === "media" ? (input.knnClip ?? []) : (input.knnText ?? []);
    },
  };
  return {
    db,
    neighborLimits,
    query: () => {
      const condition = where.mock.calls[0]?.[0];
      if (!condition) {
        throw new Error("Expected a scoped query");
      }
      return dialect.sqlToQuery(condition);
    },
  };
}

const arenaVideo = (id: string, savedAt: number): RetrievalRecord => ({
  id,
  title: id,
  url: `https://example.com/${id}`,
  author: null,
  source: "arena",
  notes: null,
  description: null,
  mediaType: "video",
  savedAt: new Date(savedAt),
});

const localMedia = (
  id: string,
  mediaType: "audio" | "video",
): RetrievalRecord => ({
  id,
  title: id,
  url: `https://example.com/${id}`,
  author: null,
  source: "local",
  notes: null,
  description: null,
  mediaType,
  savedAt: new Date(200),
});

describe("LibraryRetrievalService", () => {
  it("builds safe prefix FTS expressions", () => {
    expect(toFtsMatchQuery("Suspiria lighting")).toBe(
      '"Suspiria"* AND "lighting"*',
    );
    expect(toFtsMatchQuery(` "'*** `)).toBeNull();
  });

  it("normalizes repeated media constraints", () => {
    expect(normalizeMedia(["image", "image", "video"])).toEqual([
      "image",
      "video",
    ]);
  });

  it("uses FTS candidates and applies the image filter", async () => {
    const portrait: RetrievalRecord = {
      id: "portrait",
      title: "Studio portrait",
      url: "https://example.com/portrait",
      author: "Raphael",
      source: "arena",
      notes: null,
      description: "Editorial photography",
      mediaType: "image",
      savedAt: new Date(300),
    };
    const harness = fakeDb({
      candidates: [{ id: "portrait", rank: -2 }],
      rows: [portrait],
    });
    const result = await retrieveLibraryWithStore(
      harness.db,
      { query: "Kanye", media: ["image"], limit: 8 },
      {},
    );
    expect(result.saves.map((save) => save.id)).toEqual(["portrait"]);
    expect(result.hits[0]).toMatchObject({ channels: ["fts"] });
    expect(harness.query().params).toContain("image");
    expect(harness.query().sql).toContain("case when");
  });

  it("enforces an empty attachment scope", async () => {
    const harness = fakeDb({
      candidates: [{ id: "portrait", rank: -2 }],
      rows: [],
    });
    const result = await retrieveLibraryWithStore(
      harness.db,
      { query: "Kanye" },
      { saveIds: [] },
    );
    expect(result.saves).toEqual([]);
    expect(harness.query().sql).toContain("false");
  });

  it("lists recent scoped Saves without a lexical query", async () => {
    const video: RetrievalRecord = {
      id: "video",
      title: "Kanye interview",
      url: "https://example.com/video",
      author: "Host",
      source: "youtube",
      notes: null,
      description: "A long interview",
      mediaType: "video",
      savedAt: new Date(200),
    };
    const harness = fakeDb({ rows: [video] });
    const result = await retrieveLibraryWithStore(
      harness.db,
      { media: ["video"] },
      {},
    );
    expect(result.saves.map((save) => save.id)).toEqual(["video"]);
    expect(result.hits[0]).toMatchObject({ channels: ["recent"] });
    expect(harness.query().params).toContain("video");
  });

  it("lists only untagged Saves when asked", async () => {
    const harness = fakeDb({ rows: [] });
    await retrieveLibraryWithStore(harness.db, { untagged: true }, {});
    expect(harness.query().sql).toContain("json_array_length");
  });

  it("retrieves media candidates with the matching embedding model", async () => {
    const media: RetrievalRecord = {
      id: "media",
      title: "Untitled media",
      url: "https://example.com/media",
      author: null,
      source: "arena",
      notes: null,
      description: null,
      mediaType: "image",
      savedAt: new Date(400),
    };
    const harness = fakeDb({
      candidates: [],
      knnClip: [{ id: "media", distance: 0 }],
      rows: [media],
    });
    const result = await retrieveLibraryWithStore(
      harness.db,
      { query: "Kanye", media: ["image"] },
      {},
      {
        media: {
          model: "media-model@1",
          vector: [1, 0],
        },
      },
    );
    expect(result.saves.map((save) => save.id)).toEqual(["media"]);
    expect(result.hits[0]).toMatchObject({ channels: ["media"] });
  });

  it("ranks a media vector without a lexical query", async () => {
    const media: RetrievalRecord = {
      id: "media",
      title: "Untitled media",
      url: "https://example.com/media",
      author: null,
      source: "arena",
      notes: null,
      description: null,
      mediaType: "image",
      savedAt: new Date(400),
    };
    const harness = fakeDb({
      knnClip: [{ id: "media", distance: 0 }],
      rows: [media],
    });
    const result = await retrieveLibraryWithStore(
      harness.db,
      {},
      {},
      {
        media: {
          model: "media-model@1",
          vector: [1, 0],
        },
      },
    );
    expect(result.saves.map((save) => save.id)).toEqual(["media"]);
    expect(result.hits[0]).toMatchObject({ channels: ["media"] });
  });

  it("excludes a Save media probe while preserving its retrieval scope", async () => {
    const harness = fakeDb({
      knnClip: [
        { id: "probe", distance: 0 },
        { id: "near", distance: 0.08 },
        { id: "far", distance: 0.2 },
        { id: "outside", distance: 0.25 },
      ],
      rows: [
        arenaVideo("probe", 400),
        arenaVideo("near", 300),
        arenaVideo("far", 200),
      ],
    });

    const result = await retrieveLibraryWithStore(
      harness.db,
      { visual: { kind: "saveId", id: "probe" } },
      { saveIds: ["probe", "near", "far"] },
      { media: { model: "media-model@1", vector: [1, 0] } },
    );

    expect(result.hits.map((hit) => hit.id)).toEqual(["near", "far"]);
    expect(result.hits.every((hit) => hit.id !== "probe")).toBe(true);
    expect(result.hits.every((hit) => hit.channels.includes("media"))).toBe(
      true,
    );
  });

  it("uses one media channel for scoped audio and video Saves", async () => {
    const harness = fakeDb({
      knnClip: [
        { id: "audio", distance: 0.05 },
        { id: "video", distance: 0.1 },
      ],
      rows: [localMedia("audio", "audio"), localMedia("video", "video")],
    });

    const result = await retrieveLibraryWithStore(
      harness.db,
      { query: "applause", media: ["audio", "video"] },
      {},
      { media: { model: "media-model@1", vector: [1, 0] } },
    );

    expect(result.hits.map((hit) => hit.id)).toEqual(["audio", "video"]);
    expect(result.hits.every((hit) => hit.channels.includes("media"))).toBe(
      true,
    );
  });

  it("never compares vectors from different model versions", async () => {
    const _stale: RetrievalRecord = {
      id: "stale",
      title: "Stale vector",
      url: "https://example.com/stale",
      author: null,
      source: "arena",
      notes: null,
      description: null,
      mediaType: "image",
      savedAt: new Date(400),
    };
    const harness = fakeDb({
      candidates: [],
      knnText: [{ id: "stale", distance: 0 }],
      rows: [],
    });
    const currentModel =
      "embeddinggemma-2@revision:document:768:current-preprocessing";
    const result = await retrieveLibraryWithStore(
      harness.db,
      { query: "Kanye" },
      {},
      { text: { model: currentModel, vector: [1, 0] } },
    );
    expect(result.saves).toEqual([]);
    expect(harness.query()).toMatchObject({
      sql: expect.stringContaining('"embedding_model" = ?'),
      params: expect.arrayContaining([currentModel]),
    });
  });

  it("ranks a deeper dense candidate pool than the result window", async () => {
    const harness = fakeDb({ knnText: [] });
    await retrieveLibraryWithStore(
      harness.db,
      { query: "Kanye", limit: 500 },
      {},
      { text: { model: "model@1", vector: [1, 0] } },
    );
    expect(harness.neighborLimits).toEqual([4000]);
  });
});
