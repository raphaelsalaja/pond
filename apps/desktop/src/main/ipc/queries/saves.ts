import { existsSync } from "node:fs";
import { sep as pathSep, resolve as resolvePath } from "node:path";
import { saves } from "@pond/schema/db";
import { buildWhere, type Query } from "@pond/schema/filters";
import type { Transaction } from "@pond/schema/tx";
import { desc, eq, isNotNull } from "drizzle-orm";
import { app } from "electron";
import log from "electron-log/main.js";
import { executeBatch } from "../../core/executor";
import { refreshSave } from "../../core/refresh";
import { recordForUndo } from "../../core/undo";
import { getDb } from "../../db";
import {
  hexToRgb,
  inferSource,
  type QueryHandlerMap,
  resolveSaveFilePath,
  sanitizeFtsQuery,
} from "../helpers";
import { toWireSave, toWireSaves } from "../wire";

export const savesQueries: QueryHandlerMap = {
  async "saves.list"(params) {
    const db = await getDb();
    const hasExplicitLimit = params.limit != null;
    const baseQuery = db.select().from(saves).orderBy(desc(saves.savedAt));
    const rows = hasExplicitLimit
      ? await baseQuery.limit(Math.min(Number(params.limit), 100_000))
      : await baseQuery;
    return toWireSaves(rows);
  },

  async "saves.find"(params) {
    const db = await getDb();
    const limit = Math.min(Number(params.limit ?? 1000), 5000);
    const query = (params.query ?? null) as Query | null;
    const where = query ? buildWhere(query) : undefined;
    const rows = where
      ? await db
          .select()
          .from(saves)
          .where(where)
          .orderBy(desc(saves.savedAt))
          .limit(limit)
      : await db.select().from(saves).orderBy(desc(saves.savedAt)).limit(limit);
    return toWireSaves(rows);
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

  async "saves.get"(params) {
    const db = await getDb();
    const id = String(params.id ?? "");
    if (!id) return null;
    const rows = await db.select().from(saves).where(eq(saves.id, id));
    return rows[0] ? toWireSave(rows[0]) : null;
  },

  async "saves.dropFiles"(params) {
    const items = Array.isArray(params.items)
      ? (params.items as Array<{
          path: string;
          name?: string;
          type?: string;
        }>)
      : [];
    if (items.length === 0) return { ok: false, error: "no_items" };
    const { ingestFromHttp } = await import("../../core/ingest");
    const ids: string[] = [];
    const allowedRoots = (() => {
      const roots: string[] = [];
      for (const key of [
        "downloads",
        "pictures",
        "documents",
        "desktop",
        "music",
        "videos",
        "home",
      ] as const) {
        try {
          const p = app.getPath(key);
          if (p) roots.push(resolvePath(p));
        } catch {
          /* unsupported on this platform; skip */
        }
      }
      return roots;
    })();
    const isUnderAllowedRoot = (p: string): boolean => {
      const abs = resolvePath(p);
      return allowedRoots.some(
        (root) => abs === root || abs.startsWith(root + pathSep),
      );
    };
    for (const it of items) {
      if (!it.path || !existsSync(it.path)) continue;
      if (!isUnderAllowedRoot(it.path)) {
        log.warn("[pond ipc] dropFiles refused path outside user dirs", {
          path: it.path,
        });
        continue;
      }
      const sid = `drop-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const isImage =
        (it.type ?? "").startsWith("image/") ||
        /\.(png|jpe?g|gif|webp|avif|heic)$/i.test(it.path);
      const isVideo =
        (it.type ?? "").startsWith("video/") ||
        /\.(mp4|mov|webm|m4v)$/i.test(it.path);
      try {
        const result = await ingestFromHttp(
          {
            source: "article",
            sourceId: sid,
            url: `file://${it.path}`,
            title: it.name ?? null,
            description: null,
            author: null,
            mediaUrl: null,
            mediaType: isImage ? "image" : isVideo ? "video" : null,
            tags: [],
            raw: { drop: true },
          },
          {
            mediaFiles: [{ path: it.path, mimeType: it.type }],
          },
        );
        ids.push(result.id);
      } catch (err) {
        log.warn("[pond ipc] dropFiles ingest failed", err);
      }
    }
    return { ok: ids.length > 0, ids };
  },

  async "saves.startDrag"(params, event) {
    const id = String(params.id ?? "");
    const fileIndex = Number(params.fileIndex ?? 0);
    if (!id || !event) return { ok: false };
    const target = await resolveSaveFilePath(
      id,
      Number.isFinite(fileIndex) ? fileIndex : 0,
    );
    if (!target.ok) return { ok: false };
    try {
      const { nativeImage } = await import("electron");
      const icon = nativeImage.createEmpty();
      event.sender.startDrag({ file: target.path, icon });
      return { ok: true };
    } catch (err) {
      log.warn("[pond ipc] startDrag failed", err);
      return { ok: false };
    }
  },

  async "saves.quickAdd"(params) {
    const url = String(params.url ?? "").trim();
    const note = String(params.note ?? "");
    const tagList = Array.isArray(params.tags)
      ? (params.tags as unknown[]).map((t) => String(t))
      : [];
    if (!url) return { ok: false, error: "no_url" };
    let host = "";
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      return { ok: false, error: "invalid_url" };
    }
    const source = inferSource(host);
    const sourceId = `quick-${Date.now().toString(36)}`;
    const { ingestFromHttp } = await import("../../core/ingest");
    try {
      const result = await ingestFromHttp({
        source,
        sourceId,
        url,
        title: null,
        description: note ? note : null,
        author: null,
        mediaUrl: null,
        mediaType: null,
        tags: tagList,
        raw: { quickCapture: true },
      });
      setImmediate(() => {
        void refreshSave(result.id).catch(() => {
          /* harvester errors are surfaced via the toast on the UI */
        });
      });
      return { ok: true, id: result.id, created: result.created };
    } catch (err) {
      log.error("[pond ipc] quickAdd failed", err);
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },

  async "saves.search"(params) {
    const db = await getDb();
    const { getPrefs } = await import("../../core/prefs");
    const q = String(params.q ?? "").trim();
    const prefs = await getPrefs();
    const explicitLimit =
      params.limit !== undefined ? Number(params.limit) : undefined;
    const limit = Math.min(
      Number.isFinite(explicitLimit ?? Number.NaN)
        ? Number(explicitLimit)
        : prefs.search.resultLimit,
      2000,
    );
    if (!q) return [];
    const sanitized = sanitizeFtsQuery(q);
    let ftsRows: Array<{ id: string; rank: number }> = [];
    try {
      ftsRows = db.$raw
        .prepare(
          `SELECT id, rank FROM saves_fts WHERE saves_fts MATCH ? ORDER BY rank LIMIT ?`,
        )
        .all(sanitized, limit) as Array<{ id: string; rank: number }>;
    } catch (err) {
      log.warn("[pond search] fts query failed; falling back", err);
      ftsRows = [];
    }
    if (ftsRows.length === 0) {
      const lower = q.toLowerCase();
      const all = await db.select().from(saves);
      const matched = all.filter((r) => {
        const hay = [r.title, r.description, r.author, r.url, r.aiCaption]
          .filter((v): v is string => Boolean(v))
          .join(" ")
          .toLowerCase();
        return hay.includes(lower);
      });
      return toWireSaves(matched.slice(0, limit));
    }
    const ids = ftsRows.map((r) => r.id);
    const rows = await db.select().from(saves);
    const byId = new Map(rows.map((r) => [r.id, r]));
    return toWireSaves(
      ids
        .map((id) => byId.get(id))
        .filter((r): r is NonNullable<typeof r> => !!r),
    );
  },

  async "saves.searchByColor"(params) {
    const db = await getDb();
    const hex = String(params.hex ?? "")
      .replace(/^#/, "")
      .toLowerCase();
    const tolerance = Math.max(
      8,
      Math.min(160, Number(params.tolerance ?? 64)),
    );
    const limit = Math.min(Number(params.limit ?? 200), 1000);
    if (hex.length !== 6) return [];
    const wanted = hexToRgb(hex);
    if (!wanted) return [];
    const all = await db.select().from(saves);
    const scored = all
      .map((r) => {
        const cols = (r.dominantColors ?? []) as Array<{
          hex: string;
          weight?: number;
        }>;
        if (!cols.length) return null;
        let best = Number.POSITIVE_INFINITY;
        for (const c of cols) {
          const rgb = hexToRgb(c.hex.replace(/^#/, "").toLowerCase());
          if (!rgb) continue;
          const dist =
            Math.abs(rgb.r - wanted.r) +
            Math.abs(rgb.g - wanted.g) +
            Math.abs(rgb.b - wanted.b);
          if (dist < best) best = dist;
        }
        return Number.isFinite(best) && best <= tolerance
          ? { row: r, score: best }
          : null;
      })
      .filter((x): x is { row: (typeof all)[number]; score: number } => !!x)
      .sort((a, b) => a.score - b.score)
      .slice(0, limit);
    return toWireSaves(scored.map((s) => s.row));
  },

  async "saves.similar"(params) {
    const db = await getDb();
    const id = String(params.id ?? "");
    const limit = Math.min(Number(params.limit ?? 12), 100);
    if (!id) return [];
    let neighbours: Array<{ save_id: string; distance: number }> = [];
    try {
      neighbours = db.$raw
        .prepare(
          `SELECT save_id, distance FROM saves_vec
           WHERE embedding MATCH (SELECT embedding FROM saves_vec WHERE save_id = ?)
           ORDER BY distance ASC
           LIMIT ?`,
        )
        .all(id, limit + 1) as Array<{ save_id: string; distance: number }>;
    } catch (err) {
      log.warn("[pond search] saves_vec MATCH failed", err);
      return [];
    }
    const ids = neighbours.map((n) => n.save_id).filter((n) => n !== id);
    if (ids.length === 0) return [];
    const rows = await db.select().from(saves);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = ids
      .map((nid) => byId.get(nid))
      .filter((r): r is NonNullable<typeof r> => !!r);
    return toWireSaves(ordered);
  },

  async "saves.activity"(params) {
    const db = await getDb();
    const id = params.saveId ? String(params.saveId) : null;
    const limit = Math.min(Number(params.limit ?? 50), 500);
    const result = id
      ? db.$raw
          .prepare(
            `SELECT id, batch_id, model_name, model_id, action, data, prev_data, actor, actor_reason, created_at
             FROM sync_actions WHERE model_name = 'save' AND model_id = ?
             ORDER BY id DESC LIMIT ?`,
          )
          .all(id, limit)
      : db.$raw
          .prepare(
            `SELECT id, batch_id, model_name, model_id, action, data, prev_data, actor, actor_reason, created_at
             FROM sync_actions ORDER BY id DESC LIMIT ?`,
          )
          .all(limit);
    return result as unknown[];
  },

  async "saves.inbox"(params) {
    const db = await getDb();
    const limit = Math.min(Number(params.limit ?? 200), 1000);
    const all = await db.select().from(saves);
    const pending = all.filter((r) => {
      if (r.deletedAt) return false;
      const sug = r.aiSuggestions as {
        tags?: { appliedAt: string | null };
        caption?: { appliedAt: string | null };
        ocr?: { appliedAt: string | null };
        classification?: { appliedAt: string | null };
        summary?: { appliedAt: string | null };
      } | null;
      if (!sug) return false;
      return Object.values(sug).some(
        (s) => s && (s as { appliedAt: string | null }).appliedAt === null,
      );
    });
    return toWireSaves(pending.slice(0, limit));
  },
};
