import type { Save, SyncAction } from "@pond/schema/db";

type Stampable = Date | string | number | null | undefined;

function toMs(v: Stampable): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof v === "string") {
    const asNum = Number(v);
    if (!Number.isNaN(asNum) && v.trim() !== "" && Number.isFinite(asNum)) {
      return asNum;
    }
    const parsed = Date.parse(v);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export type WireSave = Omit<
  Save,
  | "savedAt"
  | "createdAt"
  | "archivedAt"
  | "deletedAt"
  | "embeddingUpdatedAt"
  | "publishedAt"
> & {
  savedAt: number;
  createdAt: number;
  archivedAt: number | null;
  deletedAt: number | null;
  embeddingUpdatedAt: number | null;
  publishedAt: number | null;
};

export function toWireSave(row: Save): WireSave {
  return {
    ...row,
    savedAt: toMs(row.savedAt) ?? 0,
    createdAt: toMs(row.createdAt) ?? 0,
    archivedAt: toMs(row.archivedAt),
    deletedAt: toMs(row.deletedAt),
    embeddingUpdatedAt: toMs(row.embeddingUpdatedAt),
    publishedAt: toMs(row.publishedAt),
  };
}

export function toWireSaves(rows: Save[]): WireSave[] {
  return rows.map(toWireSave);
}

export function toWireSyncAction(action: SyncAction): SyncAction {
  return {
    ...action,
    createdAt: toMs(action.createdAt as unknown as Stampable) ?? 0,
    data: normaliseDataPayload(action.data),
    prevData: normaliseDataPayload(action.prevData),
  } as unknown as SyncAction;
}

const TIMESTAMP_KEYS = [
  "savedAt",
  "createdAt",
  "archivedAt",
  "deletedAt",
  "embeddingUpdatedAt",
  "publishedAt",
] as const;

function normaliseDataPayload(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(normaliseDataPayload);
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = { ...obj };
  for (const key of TIMESTAMP_KEYS) {
    if (key in out) out[key] = toMs(out[key] as Stampable);
  }
  return out;
}
