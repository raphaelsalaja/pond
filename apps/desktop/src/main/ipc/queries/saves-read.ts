import { saves, type Task, tasks } from "@pond/schema/db";
import { buildWhere, isEmptyQuery } from "@pond/schema/filters";
import type { RawJson } from "@pond/schema/raw";
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  type SQL,
  sql,
} from "drizzle-orm";
import log from "electron-log/main.js";
import { z } from "zod";
import { LibraryQueryRequestSchema as LibraryQueryParams } from "../../../shared/library-query";
import {
  queryActiveLibraryIds,
  queryActiveLibraryPage,
} from "../../core/active-library-query";
import { compileKeywordWhere } from "../../core/keyword-query";
import { librarySortColumn } from "../../core/library-query";
import { libraryRetrievalInput } from "../../core/library-retrieval";
import { getPrefs } from "../../core/prefs";
import { querySidebarCounts } from "../../core/sidebar-counts";
import { querySplitPosts } from "../../core/split-posts";
import type { Db } from "../../db";
import { getDb } from "../../db";
import { resolveSaveFilePath } from "../helpers";
import { type SaveListRow, toWireSaves } from "../wire";
import {
  FileIndexParam,
  FlagParam,
  OptionalNumberParam,
  type QueryHandlerMap,
  QueryParam,
  query,
  StringListParam,
  StringParam,
} from "./params";
import { cursorFor } from "./saves-page";

function isHttpUrl(u: string | undefined | null): u is string {
  if (!u) return false;
  return u.startsWith("http://") || u.startsWith("https://");
}

const OpenGraphImageSchema = z.object({ "og:image": z.string() });

function derivePublicImageUrl(raw: RawJson | null): string | null {
  if (!raw) return null;
  const media = raw.capture?.media ?? [];
  const image = media.find((m) => m.type === "image" && isHttpUrl(m.url));
  if (image) return image.url;
  const video = media.find((m) => m.type === "video" && isHttpUrl(m.posterUrl));
  if (video?.posterUrl) return video.posterUrl;
  const ytdlpThumb = raw.ytdlp?.thumbnail;
  if (isHttpUrl(ytdlpThumb)) return ytdlpThumb;
  const cardImage = raw.capture?.card?.imageUrl;
  if (isHttpUrl(cardImage)) return cardImage;
  const extras = OpenGraphImageSchema.safeParse(raw.capture?.extras);
  if (extras.success && isHttpUrl(extras.data["og:image"])) {
    return extras.data["og:image"];
  }
  return null;
}

/** SQLite caps bound parameters (~32k), so chunk the IN list; large libraries would otherwise throw "too many SQL variables". */
const TASK_ID_CHUNK = 10_000;

async function loadTasksFor(
  db: Db,
  ids: string[],
): Promise<Map<string, Task[]>> {
  if (ids.length === 0) return new Map();
  const grouped = new Map<string, Task[]>();
  for (let i = 0; i < ids.length; i += TASK_ID_CHUNK) {
    const slice = ids.slice(i, i + TASK_ID_CHUNK);
    const rows = await db
      .select()
      .from(tasks)
      .where(inArray(tasks.saveId, slice));
    for (const t of rows) {
      const existing = grouped.get(t.saveId);
      if (existing) existing.push(t);
      else grouped.set(t.saveId, [t]);
    }
  }
  return grouped;
}

const {
  rawJson: _omitRawJson,
  embedding: _omitEmbedding,
  clipEmbedding: _omitClipEmbedding,
  transcript: _omitTranscript,
  ...SAVE_LIST_COLUMNS
} = getTableColumns(saves);

const IdParams = z.object({ id: StringParam });
const FileParams = z.object({ id: StringParam, fileIndex: FileIndexParam });

export const savesReadQueries = {
  "saves.sidebarCounts": query(
    z.object({
      recentIds: z.array(z.string()).max(100).optional(),
    }),
    async ({ recentIds }) => {
      const ids =
        recentIds ??
        (await getPrefs()).saveRecents.entries.map((entry) => entry.saveId);
      return querySidebarCounts(await getDb(), [], ids);
    },
  ),
  "saves.queryPage": query(LibraryQueryParams, queryActiveLibraryPage),
  "saves.queryIds": query(LibraryQueryParams, queryActiveLibraryIds),
  "saves.queryCount": query(z.object({ query: QueryParam }), async (params) => {
    const db = await getDb();

    const rows = await db
      .select({ count: count() })
      .from(saves)
      .where(
        and(
          isNull(saves.deletedAt),
          params.query ? buildWhere(params.query) : undefined,
        ),
      );
    return { count: rows[0]?.count ?? 0 };
  }),
  async "saves.splitPosts"() {
    return querySplitPosts(await getDb());
  },
  "saves.get": query(z.object({ id: StringParam }), async (params) => {
    if (!params.id) return null;
    const db = await getDb();

    const rows = await db
      .select(SAVE_LIST_COLUMNS)
      .from(saves)
      .where(eq(saves.id, params.id));
    const row = rows[0];
    if (!row) return null;
    const grouped = await loadTasksFor(db, [row.id]);
    const { rawSlim, ...rest } = row;
    return toWireSaves([{ ...rest, rawJson: rawSlim }], grouped)[0] ?? null;
  }),

  "saves.list": query(
    z.object({ limit: OptionalNumberParam }),
    async (params) => {
      const db = await getDb();

      const baseQuery = db
        .select(SAVE_LIST_COLUMNS)
        .from(saves)
        .orderBy(desc(saves.savedAt));
      const rows =
        params.limit != null
          ? await baseQuery.limit(Math.min(params.limit, 100_000))
          : await baseQuery;
      const grouped = await loadTasksFor(
        db,
        rows.map((r) => r.id),
      );
      const listRows = rows.map(({ rawSlim, ...rest }) => ({
        ...rest,
        rawJson: rawSlim,
      }));
      return toWireSaves(listRows, grouped);
    },
  ),

  "saves.listPage": query(
    z.object({
      limit: OptionalNumberParam,
      cursor: z
        .object({ savedAt: z.number(), id: z.string().min(1) })
        .nullable()
        .catch(null),
    }),
    async (params) => {
      const startedAt = Date.now();
      const limit = Math.min(Math.max(1, params.limit || 250), 500);
      const cursor = params.cursor;
      const after = cursor
        ? sql`(${saves.savedAt}, ${saves.id}) < (${cursor.savedAt}, ${cursor.id})`
        : undefined;
      const db = await getDb();
      const rows = await db
        .select(SAVE_LIST_COLUMNS)
        .from(saves)
        .where(after)
        .orderBy(desc(saves.savedAt), desc(saves.id))
        .limit(limit + 1);
      const pageRows = rows.slice(0, limit);
      const grouped = await loadTasksFor(
        db,
        pageRows.map((row) => row.id),
      );
      const totalRow = cursor
        ? null
        : (await db.select({ value: count() }).from(saves))[0];
      const listRows = pageRows.map(({ rawSlim, ...rest }) => ({
        ...rest,
        rawJson: rawSlim,
      }));
      const payload = {
        rows: toWireSaves(listRows, grouped),
        nextCursor:
          rows.length > limit
            ? cursorFor(
                pageRows.map((row) => ({
                  savedAt: row.savedAt.getTime(),
                  id: row.id,
                })),
              )
            : null,
        total: totalRow ? Number(totalRow.value ?? 0) : null,
      };
      log.info("[pond ipc] saves.listPage", {
        rows: payload.rows.length,
        total: payload.total,
        ms: Date.now() - startedAt,
      });
      return payload;
    },
  ),

  "saves.searchFts": query(
    z.object({
      q: StringParam,
      limit: OptionalNumberParam,
      deletedOnly: FlagParam,
      mode: z.enum(["all", "any"]).catch("all"),
    }),
    async (params) => {
      const q = params.q.trim();
      if (!q) return { ids: [], scores: {} };
      const limit = Math.min(Math.max(1, params.limit || 10_000), 10_000);
      const db = await getDb();
      const rows = await db
        .select({ id: saves.id })
        .from(saves)
        .where(
          and(
            params.deletedOnly
              ? isNotNull(saves.deletedAt)
              : isNull(saves.deletedAt),
            compileKeywordWhere(q, params.mode),
          ),
        )
        .orderBy(desc(saves.savedAt), desc(saves.id))
        .limit(limit);
      const ids = rows.map((row) => row.id);
      const scores = Object.fromEntries(ids.map((id) => [id, 1]));
      return { ids, scores };
    },
  ),

  "saves.retrieve": query(
    libraryRetrievalInput.extend({
      saveIds: z.array(z.string()).max(10_000).optional(),
      libraryQuery: LibraryQueryParams.optional(),
    }),
    async (params) => {
      const { retrieveLibrary } = await import("../../core/library-retrieval");
      const { saveIds, libraryQuery, ...input } = params;
      return await retrieveLibrary(input, { saveIds, libraryQuery });
    },
  ),

  "saves.related": query(
    z.object({
      id: z.string().min(1),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    async (params) => {
      const { relatedSaves } = await import(
        "../../core/semantic-recommendations"
      );
      return await relatedSaves(await getDb(), params);
    },
  ),

  "saves.semanticClusters": query(
    z.object({
      saveIds: z.array(z.string().trim().min(1)).max(2_000).optional(),
      folderId: z.string().trim().min(1).optional(),
      distance: z.number().finite().min(0).max(2),
      limit: z.number().int().min(3).max(2_000),
    }),
    async (params) => {
      const { semanticClusters } = await import("../../core/semantic-clusters");
      return await semanticClusters(await getDb(), params);
    },
  ),

  "saves.classifyLabels": query(
    z.object({
      saveIds: z.array(z.string().trim().min(1)).min(1).max(2_000),
      labels: z.array(z.string().trim().min(1).max(80)).min(1).max(50),
    }),
    async (params) => {
      const { classifyLabels } = await import(
        "../../core/semantic-classification"
      );
      return await classifyLabels(await getDb(), params);
    },
  ),

  "saves.query": query(
    z.object({
      query: QueryParam,
      deletedOnly: FlagParam,
      sortKey: StringParam,
      sortDir: z.enum(["asc", "desc"]).catch("desc"),
      limit: OptionalNumberParam,
    }),
    async (params) => {
      if (!params.query || isEmptyQuery(params.query)) return { ids: [] };
      const compiled = buildWhere(params.query);
      const trash: SQL = params.deletedOnly
        ? isNotNull(saves.deletedAt)
        : isNull(saves.deletedAt);
      const where = compiled ? and(trash, compiled) : trash;
      const orderCol = librarySortColumn(params.sortKey);
      const order = params.sortDir === "asc" ? asc(orderCol) : desc(orderCol);
      const limit =
        params.limit != null
          ? Math.min(Math.max(1, params.limit || 1), 100_000)
          : null;
      const db = await getDb();
      const base = db
        .select({ id: saves.id })
        .from(saves)
        .where(where)
        .orderBy(asc(sql`${orderCol} is null`), order, desc(saves.id));
      const rows = limit != null ? await base.limit(limit) : await base;
      return { ids: rows.map((r) => r.id) };
    },
  ),

  "saves.getMany": query(z.object({ ids: StringListParam }), async (params) => {
    const ids = params.ids.filter(Boolean);
    if (ids.length === 0) return [];
    const db = await getDb();
    const out: SaveListRow[] = [];
    const groupedAll = new Map<string, Task[]>();
    for (let i = 0; i < ids.length; i += TASK_ID_CHUNK) {
      const slice = ids.slice(i, i + TASK_ID_CHUNK);
      const rows = await db
        .select(SAVE_LIST_COLUMNS)
        .from(saves)
        .where(inArray(saves.id, slice));
      const grouped = await loadTasksFor(
        db,
        rows.map((r) => r.id),
      );
      for (const [k, v] of grouped) groupedAll.set(k, v);
      for (const { rawSlim, ...rest } of rows) {
        out.push({ ...rest, rawJson: rawSlim });
      }
    }
    return toWireSaves(out, groupedAll);
  }),

  "saves.rawJson": query(IdParams, async (params) => {
    const db = await getDb();
    const id = params.id;
    if (!id) return { id: "", rawJson: null };
    const rows = await db
      .select({ rawJson: saves.rawJson })
      .from(saves)
      .where(eq(saves.id, id));
    return { id, rawJson: rows[0]?.rawJson ?? null };
  }),

  "saves.filePath": query(FileParams, async (params) => {
    if (!params.id) return { ok: false as const, reason: "not_found" as const };
    const result = await resolveSaveFilePath(params.id, params.fileIndex);
    return result.ok
      ? {
          ok: true as const,
          path: result.path,
        }
      : result;
  }),

  async "saves.embeddings"() {
    const db = await getDb();
    const rows = await db
      .select({
        id: saves.id,
        embeddingModel: saves.embeddingModel,
      })
      .from(saves)
      .where(isNotNull(saves.embeddingModel));
    return rows.map((r) => ({
      id: r.id,
      embedding: null,
      embeddingModel: r.embeddingModel ?? null,
    }));
  },

  "saves.getEmbedding": query(IdParams, async (params) => {
    const db = await getDb();
    const rows = await db
      .select({
        id: saves.id,
        embedding: saves.embedding,
        embeddingModel: saves.embeddingModel,
      })
      .from(saves)
      .where(eq(saves.id, params.id))
      .limit(1);
    const row = rows[0];
    if (!row) return { id: params.id, embedding: null, embeddingModel: null };
    return {
      id: row.id,
      embedding: row.embedding ?? null,
      embeddingModel: row.embeddingModel ?? null,
    };
  }),

  async "saves.clipEmbeddings"() {
    const db = await getDb();
    const rows = await db
      .select({
        id: saves.id,
        clipModel: saves.clipModel,
      })
      .from(saves)
      .where(isNotNull(saves.clipModel));
    return rows.map((r) => ({
      id: r.id,
      clipEmbedding: null,
      clipModel: r.clipModel ?? null,
    }));
  },

  "saves.publicImageUrl": query(IdParams, async (params) => {
    if (!params.id) return { ok: false as const, error: "Save not found." };
    const db = await getDb();
    const rows = await db.select().from(saves).where(eq(saves.id, params.id));
    const row = rows[0];
    if (!row) return { ok: false as const, error: "Save not found." };
    return { ok: true as const, url: derivePublicImageUrl(row.rawJson) };
  }),
} satisfies QueryHandlerMap;
