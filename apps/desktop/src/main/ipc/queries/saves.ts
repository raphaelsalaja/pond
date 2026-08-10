import { type Save, saves, type Task, tasks } from "@pond/schema/db";
import { buildWhere, isEmptyQuery, type Query } from "@pond/schema/filters";
import type { RawJson } from "@pond/schema/raw";
import type { Transaction } from "@pond/schema/tx";
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
import { clipboard, nativeImage } from "electron";
import log from "electron-log/main.js";
import { executeBatch } from "../../core/executor";
import { persistSave } from "../../core/persist-save";
import { retryFailedSaves } from "../../core/pipeline/enqueue";
import { runRenderTextCover } from "../../core/pipeline/workers/render-text-cover";
import { recordForUndo } from "../../core/undo";
import type { Db } from "../../db";
import { getDb } from "../../db";
import { type QueryHandlerMap, resolveSaveFilePath } from "../helpers";
import { toWireSaves } from "../wire";
import { savesExportQueries } from "./saves-export";
import { savesImportQueries } from "./saves-import";
import { cursorFor, type SavePageCursor } from "./saves-page";

function isHttpUrl(u: string | undefined | null): u is string {
  if (!u) return false;
  return u.startsWith("http://") || u.startsWith("https://");
}

/** Public http(s) URL for the save's primary image, for reverse image search. */
function derivePublicImageUrl(raw: RawJson | null): string | null {
  if (!raw) return null;
  const media = raw.capture?.media ?? [];
  const image = media.find((m) => m.type === "image" && isHttpUrl(m.url));
  if (image) return image.url;
  const video = media.find((m) => m.type === "video" && isHttpUrl(m.posterUrl));
  if (video?.posterUrl) return video.posterUrl;
  const ytdlpThumb = raw.ytdlp?.thumbnail;
  if (isHttpUrl(ytdlpThumb)) return ytdlpThumb;
  const extras =
    raw.capture?.extras && typeof raw.capture.extras === "object"
      ? (raw.capture.extras as Record<string, unknown>)
      : null;
  const card = extras?.card;
  if (card && typeof card === "object") {
    const cardImage = (card as Record<string, unknown>).imageUrl;
    if (typeof cardImage === "string" && isHttpUrl(cardImage)) return cardImage;
  }
  const ogImage = extras?.["og:image"];
  if (typeof ogImage === "string" && isHttpUrl(ogImage)) return ogImage;
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

/** Every saves column except the heavy rawJson blob, embedding vectors, and full transcript text. */
const {
  rawJson: _omitRawJson,
  embedding: _omitEmbedding,
  clipEmbedding: _omitClipEmbedding,
  transcript: _omitTranscript,
  ...SAVE_LIST_COLUMNS
} = getTableColumns(saves);

/** Columns the enrichment pipeline may write back via `saves.patchDerived`; all on-device-derived and non-synced, so writing them never emits a sync action. */
const DERIVED_COLUMNS = {
  caption: saves.caption,
  captionModel: saves.captionModel,
  ocrText: saves.ocrText,
  ocrModel: saves.ocrModel,
  transcript: saves.transcript,
  transcriptModel: saves.transcriptModel,
  clipEmbedding: saves.clipEmbedding,
  clipModel: saves.clipModel,
  aesthetic: saves.aesthetic,
  aestheticModel: saves.aestheticModel,
  autoTitleModel: saves.autoTitleModel,
  suggestedTags: saves.suggestedTags,
  suggestedTagsModel: saves.suggestedTagsModel,
} as const;

type DerivedKey = keyof typeof DERIVED_COLUMNS;

export const savesQueries: QueryHandlerMap = {
  ...savesImportQueries,
  ...savesExportQueries,

  async "saves.list"(params) {
    const db = await getDb();
    const hasExplicitLimit = params.limit != null;
    const baseQuery = db
      .select(SAVE_LIST_COLUMNS)
      .from(saves)
      .orderBy(desc(saves.savedAt));
    const rows = hasExplicitLimit
      ? await baseQuery.limit(Math.min(Number(params.limit), 100_000))
      : await baseQuery;
    const grouped = await loadTasksFor(
      db,
      rows.map((r) => r.id),
    );
    /** raw_slim already holds the slim projection, so present it as rawJson directly instead of re-slimming the unselected full blob. */
    const listRows = rows.map(({ rawSlim, ...rest }) => ({
      ...rest,
      rawJson: rawSlim,
    })) as Save[];
    return toWireSaves(listRows, grouped);
  },

  /** Cursor-paged, recency-sorted listing for the ordinary library grid. */
  async "saves.listPage"(params) {
    const limit = Math.min(Math.max(1, Number(params.limit) || 250), 500);
    const raw = params.cursor as Partial<SavePageCursor> | undefined;
    const savedAt = raw?.savedAt;
    const cursor =
      typeof savedAt === "number" &&
      Number.isFinite(savedAt) &&
      typeof raw?.id === "string" &&
      raw.id
        ? { savedAt, id: raw.id }
        : null;
    /** Row-value comparison lets SQLite seek directly into the matching composite index instead of merging two scans and sorting through a temporary B-tree. */
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
    const totalRow = (await db.select({ value: count() }).from(saves))[0];
    const listRows = pageRows.map(({ rawSlim, ...rest }) => ({
      ...rest,
      rawJson: rawSlim,
    })) as Save[];
    return {
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
      total: Number(totalRow?.value ?? 0),
    };
  },

  /** Keyword search via saves_fts; scores are BM25 rank (lower is better in FTS5, inverted for callers). */
  async "saves.searchFts"(params) {
    const q = String(params.q ?? "").trim();
    if (!q)
      return { ids: [] as string[], scores: {} as Record<string, number> };
    const limit = Math.min(
      Math.max(1, Number(params.limit ?? 10_000) || 10_000),
      10_000,
    );
    const deletedOnly = Boolean(params.deletedOnly);
    const match = toFtsMatchQuery(q, params.mode === "any" ? "any" : "all");
    if (!match) {
      return { ids: [] as string[], scores: {} as Record<string, number> };
    }
    const db = await getDb();
    const trashClause = deletedOnly
      ? "s.deleted_at IS NOT NULL"
      : "s.deleted_at IS NULL";
    const rows = db.$raw
      .prepare(
        `SELECT f.id AS id, bm25(saves_fts) AS rank
         FROM saves_fts f
         JOIN saves s ON s.id = f.id
         WHERE saves_fts MATCH ? AND ${trashClause}
         ORDER BY rank
         LIMIT ?`,
      )
      .all(match, limit) as Array<{ id: string; rank: number }>;
    const scores: Record<string, number> = {};
    const ids: string[] = [];
    for (const row of rows) {
      ids.push(row.id);
      /** Invert FTS5 bm25 (more negative = better) into a positive relevance score. */
      scores[row.id] = -row.rank;
    }
    return { ids, scores };
  },

  /** Structured filter pushdown; color predicates are not compiled and must be applied by the caller. */
  async "saves.query"(params) {
    const query = params.query as Query | null | undefined;
    if (!query || isEmptyQuery(query)) {
      return { ids: [] as string[] };
    }
    const compiled = buildWhere(query);
    const deletedOnly = Boolean(params.deletedOnly);
    const trash: SQL = deletedOnly
      ? isNotNull(saves.deletedAt)
      : isNull(saves.deletedAt);
    const where = compiled ? and(trash, compiled) : trash;
    const sortKey = String(params.sortKey ?? "savedAt");
    const sortDir = params.sortDir === "asc" ? "asc" : "desc";
    const orderCol =
      sortKey === "createdAt"
        ? saves.createdAt
        : sortKey === "title"
          ? saves.title
          : sortKey === "fileSize"
            ? saves.fileSize
            : saves.savedAt;
    const order = sortDir === "asc" ? asc(orderCol) : desc(orderCol);
    const limit =
      params.limit != null
        ? Math.min(Math.max(1, Number(params.limit) || 1), 100_000)
        : null;
    const db = await getDb();
    const base = db
      .select({ id: saves.id })
      .from(saves)
      .where(where)
      .orderBy(order);
    const rows = limit != null ? await base.limit(limit) : await base;
    return { ids: rows.map((r) => r.id) };
  },

  /** Hydrate slim rows for a set of ids (hot-set / cold fetch). */
  async "saves.getMany"(params) {
    const ids = Array.isArray(params.ids)
      ? params.ids.map((id) => String(id)).filter(Boolean)
      : [];
    if (ids.length === 0) return [];
    const db = await getDb();
    const out: Save[] = [];
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
        out.push({ ...rest, rawJson: rawSlim } as Save);
      }
    }
    return toWireSaves(out, groupedAll);
  },

  /** Full rawJson for one save; the detail view hydrates it lazily. */
  async "saves.rawJson"(params) {
    const db = await getDb();
    const id = String(params.id ?? "");
    if (!id) return { id: "", rawJson: null };
    const rows = await db
      .select({ rawJson: saves.rawJson })
      .from(saves)
      .where(eq(saves.id, id));
    return { id, rawJson: rows[0]?.rawJson ?? null };
  },

  async "saves.emptyTrash"() {
    const db = await getDb();
    const rows = await db
      .select()
      .from(saves)
      .where(isNotNull(saves.deletedAt));
    if (rows.length === 0) return { ok: true, count: 0 };
    const txs: Transaction[] = rows.map((r) => ({
      kind: "purge",
      model: "save",
      id: r.id,
      before: r,
      meta: { actor: "user", actorReason: "empty-trash" },
    }));
    await executeBatch(txs);
    for (const tx of txs) recordForUndo(tx);
    return { ok: true, count: txs.length };
  },

  async "saves.restoreAll"() {
    const db = await getDb();
    const rows = await db
      .select({ id: saves.id })
      .from(saves)
      .where(isNotNull(saves.deletedAt));
    if (rows.length === 0) return { ok: true, count: 0 };
    const txs: Transaction[] = rows.map((r) => ({
      kind: "untrash",
      model: "save",
      id: r.id,
      meta: { actor: "user", actorReason: "restore-all" },
    }));
    await executeBatch(txs);
    for (const tx of txs) recordForUndo(tx);
    return { ok: true, count: txs.length };
  },

  /** Re-runs saves stuck in `failed`; `ids` scopes the retry to a selection, omitted retries every failed save. */
  async "saves.retryFailed"(params) {
    const ids = Array.isArray(params.ids)
      ? (params.ids as unknown[]).map(String).filter(Boolean)
      : undefined;
    const requeued = await retryFailedSaves(ids);
    return { ok: true as const, requeued };
  },

  async "saves.filePath"(params) {
    const id = String(params.id ?? "");
    const fileIndex = Number(params.fileIndex ?? 0);
    if (!id) return { ok: false as const, reason: "not_found" as const };
    return resolveSaveFilePath(id, Number.isFinite(fileIndex) ? fileIndex : 0);
  },

  async "saves.setPhash"(params) {
    const id = String(params.id ?? "");
    const phash = params.phash != null ? String(params.phash) : null;
    if (!id) return { ok: false };
    await persistSave(id, { phash }, { actorReason: "duplicates:phash" });
    return { ok: true };
  },

  /** All persisted embeddings, loaded once on startup into the renderer's in-memory store; vectors are excluded from saves.list, so this is the only path that reads them. */
  async "saves.embeddings"() {
    const db = await getDb();
    const rows = await db
      .select({
        id: saves.id,
        embedding: saves.embedding,
        embeddingModel: saves.embeddingModel,
      })
      .from(saves)
      .where(isNotNull(saves.embedding));
    return rows.map((r) => ({
      id: r.id,
      embedding: r.embedding ?? null,
      embeddingModel: r.embeddingModel ?? null,
    }));
  },

  /** Written directly, not via the sync executor: the vector would bloat the sync-action ring and embeddings are cheap to re-derive per device. */
  async "saves.setEmbedding"(params) {
    const id = String(params.id ?? "");
    if (!id) return { ok: false };
    const raw = params.embedding;
    const embedding =
      Array.isArray(raw) && raw.every((n) => typeof n === "number")
        ? (raw as number[])
        : null;
    const embeddingModel =
      params.embeddingModel != null ? String(params.embeddingModel) : null;
    const db = await getDb();
    await db
      .update(saves)
      .set({ embedding, embeddingModel })
      .where(eq(saves.id, id));
    return { ok: true };
  },

  /** All persisted CLIP image vectors, hydrated into the renderer's clip store on startup; mirrors `saves.embeddings`. */
  async "saves.clipEmbeddings"() {
    const db = await getDb();
    const rows = await db
      .select({
        id: saves.id,
        clipEmbedding: saves.clipEmbedding,
        clipModel: saves.clipModel,
      })
      .from(saves)
      .where(isNotNull(saves.clipEmbedding));
    return rows.map((r) => ({
      id: r.id,
      clipEmbedding: r.clipEmbedding ?? null,
      clipModel: r.clipModel ?? null,
    }));
  },

  /** Whitelisted, DB-only write-back for on-device enrichment; the saves AFTER UPDATE trigger refreshes the FTS index for text columns automatically. */
  async "saves.patchDerived"(params) {
    const id = String(params.id ?? "");
    if (!id) return { ok: false as const };
    const patch = (params.patch ?? {}) as Record<string, unknown>;
    const set: Record<string, unknown> = {};
    for (const key of Object.keys(patch) as DerivedKey[]) {
      if (key in DERIVED_COLUMNS) set[key] = patch[key];
    }
    if (Object.keys(set).length === 0) return { ok: false as const };
    const db = await getDb();
    await db.update(saves).set(set).where(eq(saves.id, id));
    return { ok: true as const };
  },

  async "saves.copyImage"(params) {
    const id = String(params.id ?? "");
    const fileIndex = Number(params.fileIndex ?? 0);
    if (!id) return { ok: false as const, reason: "not_found" as const };
    const target = await resolveSaveFilePath(
      id,
      Number.isFinite(fileIndex) ? fileIndex : 0,
    );
    if (!target.ok) return target;
    try {
      const img = nativeImage.createFromPath(target.path);
      if (img.isEmpty()) {
        return { ok: false as const, reason: "missing" as const };
      }
      clipboard.writeImage(img);
      return { ok: true as const };
    } catch (err) {
      log.warn("[pond ipc] saves.copyImage failed", err);
      return { ok: false as const, reason: "internal_error" as const };
    }
  },

  async "saves.copyFile"(params) {
    const id = String(params.id ?? "");
    const fileIndex = Number(params.fileIndex ?? 0);
    if (!id) return { ok: false as const, reason: "not_found" as const };
    const target = await resolveSaveFilePath(
      id,
      Number.isFinite(fileIndex) ? fileIndex : 0,
    );
    if (!target.ok) return target;
    try {
      if (process.platform === "darwin") {
        /** Write the file reference to the pasteboard so it pastes as a file into Finder or Mail, distinct from the image data copy. */
        const url = `file://${encodeURI(target.path)}`;
        clipboard.writeBuffer("public.file-url", Buffer.from(url, "utf8"));
      } else {
        clipboard.writeText(target.path);
      }
      return { ok: true as const };
    } catch (err) {
      log.warn("[pond ipc] saves.copyFile failed", err);
      return { ok: false as const, reason: "internal_error" as const };
    }
  },

  /** Main-process pasteboard write; renderer clipboard rejects once a closing menu steals focus. */
  async "clipboard.writeText"(params) {
    const text = String(params.text ?? "");
    if (!text) return { ok: false as const };
    try {
      clipboard.writeText(text);
      return { ok: true as const };
    } catch (err) {
      log.warn("[pond ipc] clipboard.writeText failed", err);
      return { ok: false as const };
    }
  },

  async "saves.backfillColors"() {
    const { extractPalette } = await import("../../lib/palette");
    const { itemFile } = await import("../../paths");

    const db = await getDb();
    const rows = await db
      .select()
      .from(saves)
      .where(eq(saves.mediaType, "image"));

    let updated = 0;
    for (const row of rows) {
      if ((row.dominantColors ?? []).length > 0) continue;
      const files = row.files ?? [];
      const cover = files[row.coverIndex ?? 0] ?? files[0];
      if (!cover) continue;
      const colors = await extractPalette(itemFile(row.id, cover.path));
      if (colors.length > 0) {
        await persistSave(
          row.id,
          { dominantColors: colors },
          { actorReason: "color:backfill" },
        );
        updated++;
      }
    }
    return { ok: true, updated };
  },

  async "saves.publicImageUrl"(params) {
    const id = String(params.id ?? "");
    if (!id) return { ok: false as const, url: null };
    const db = await getDb();
    const rows = await db.select().from(saves).where(eq(saves.id, id));
    const row = rows[0];
    if (!row) return { ok: false as const, url: null };
    const raw = (row.rawJson ?? null) as RawJson | null;
    const url = derivePublicImageUrl(raw);
    return { ok: true as const, url };
  },

  /** Backfill rasterized text covers for existing text-only saves (same worker as the pipeline op). */
  async "saves.ensureTextCover"(params) {
    const id = String(params.id ?? "");
    if (!id) return { ok: false as const, captured: 0 };
    const force = Boolean(params.force);
    const captured = await runRenderTextCover(id, { force });
    return { ok: true as const, captured };
  },
};

/** Quote tokens for FTS5; AND for "all", OR for "any". */
function toFtsMatchQuery(q: string, mode: "all" | "any"): string | null {
  const tokens = q
    .split(/\s+/)
    .map((t) => t.replaceAll('"', "").replaceAll("'", "").trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return null;
  const quoted = tokens.map((t) => `"${t}"`);
  return quoted.join(mode === "any" ? " OR " : " ");
}
