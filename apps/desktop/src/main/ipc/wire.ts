import type { Save, SyncAction } from "@pond/schema/db";

/**
 * Wire serialisation helpers.
 *
 * Drizzle's `integer({ mode: "timestamp_ms" })` columns come back as JS
 * `Date` objects. Electron's structured clone preserves Dates across IPC
 * intact, so the renderer ends up with `Date` values even though the
 * `Save` type in `renderer/src/pool/types.ts` declares them as strings.
 *
 * That mismatch is the fastest way to break the Object Pool (sorting,
 * comparison, JSON round-trips). We fix it once, here, and funnel every
 * main → renderer payload through `toWire*` so the renderer only ever
 * sees ISO strings.
 */

type Isoable = Date | string | number | null | undefined;

/** Convert a value that may be a Date / number / string into an ISO string. */
export function toIso(v: Isoable): string | null {
  if (v == null) return null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? v.toISOString() : null;
  }
  if (typeof v === "number") {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  if (typeof v === "string") {
    // Accept both ISO strings and numeric-string timestamps.
    const asNumber = Number(v);
    if (!Number.isNaN(asNumber) && v.trim() !== "") {
      const d = new Date(asNumber);
      if (Number.isFinite(d.getTime())) return d.toISOString();
    }
    return v;
  }
  return null;
}

/** Renderer-safe view of a `Save` row: every timestamp is ISO (or null). */
export type WireSave = Omit<
  Save,
  "savedAt" | "createdAt" | "archivedAt" | "deletedAt" | "embeddingUpdatedAt"
> & {
  savedAt: string;
  createdAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
  embeddingUpdatedAt: string | null;
};

export function toWireSave(row: Save): WireSave {
  return {
    ...row,
    savedAt: toIso(row.savedAt) ?? new Date(0).toISOString(),
    createdAt: toIso(row.createdAt) ?? new Date(0).toISOString(),
    archivedAt: toIso(row.archivedAt),
    deletedAt: toIso(row.deletedAt),
    embeddingUpdatedAt: toIso(row.embeddingUpdatedAt),
  };
}

export function toWireSaves(rows: Save[]): WireSave[] {
  return rows.map(toWireSave);
}

/**
 * Serialise a `SyncAction` for transmission. The `data` / `prevData`
 * fields can be any JSON payload; the executor stores them as JSONB. When
 * the payload looks like a partial save row (i.e. has `id` + the save
 * timestamp columns), we recursively normalise so the renderer's pool
 * reconciler can trust them.
 */
export function toWireSyncAction(action: SyncAction): SyncAction {
  return {
    ...action,
    createdAt: toIso(action.createdAt as unknown as Isoable) ?? "",
    data: normaliseDataPayload(action.data),
    prevData: normaliseDataPayload(action.prevData),
  } as unknown as SyncAction;
}

function normaliseDataPayload(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(normaliseDataPayload);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = { ...obj };
  for (const key of [
    "savedAt",
    "createdAt",
    "archivedAt",
    "deletedAt",
    "embeddingUpdatedAt",
  ]) {
    if (key in out) out[key] = toIso(out[key] as Isoable);
  }
  return out;
}
