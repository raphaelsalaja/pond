import { notifyAll, notifyId, notifyListAndId, pool } from "./pool";
import type { Save } from "./types";

// Fields that influence whether (or where) a save shows up in any
// filtered list. A change to one of these has to wake list
// subscribers; everything else (title/description/files/etc.) only
// wakes per-id subscribers.
const LIST_AFFECTING_FIELDS: ReadonlyArray<keyof Save> = [
  "status",
  "deletedAt",
  "tags",
  "source",
  "savedAt",
];

function affectsList(data: Partial<Save>): boolean {
  for (const key of LIST_AFFECTING_FIELDS) {
    if (key in data) return true;
  }
  return false;
}

export interface SyncActionEvent {
  id: number;
  batchId: string | null;
  modelName: "save" | "tag" | "settings";
  modelId: string;
  action: "I" | "U" | "D" | "A";
  data: unknown;
  prevData: unknown;
  actor: "user" | "system";
  actorReason: string | null;
  createdAt: string;
}

export function applyAction(event: SyncActionEvent): void {
  if (event.modelName !== "save") return;

  if (event.action === "I") {
    const save = normalise(event.data as Partial<Save>);
    if (!save) return;
    pool.upsert(save);
    notifyListAndId(save.id);
    return;
  }

  if (event.action === "U") {
    const patch = event.data as Partial<Save>;
    const existing = pool.get(event.modelId);
    if (!existing) {
      const created = normalise(patch);
      if (created) {
        pool.upsert(created);
        notifyListAndId(created.id);
      }
      return;
    }
    const merged = normalise({
      ...existing,
      ...patch,
      id: existing.id,
    });
    if (!merged) return;
    pool.upsert(merged);
    if (affectsList(patch)) {
      notifyListAndId(merged.id);
    } else {
      notifyId(merged.id);
    }
    return;
  }

  if (event.action === "D") {
    pool.delete(event.modelId);
    notifyAll();
    return;
  }

  if (event.action === "A") {
    const existing = pool.get(event.modelId);
    if (!existing) return;
    const patched = event.data as Partial<Save>;
    const merged = normalise({ ...existing, ...patched });
    if (!merged) return;
    pool.upsert(merged);
    if (affectsList(patched)) {
      notifyListAndId(event.modelId);
    } else {
      notifyId(event.modelId);
    }
  }
}

export function normalise(raw: Partial<Save> | null | undefined): Save | null {
  if (!raw?.id) return null;
  return {
    id: raw.id,
    source: raw.source ?? "twitter",
    sourceId: raw.sourceId ?? "",
    url: raw.url ?? "",
    title: raw.title ?? null,
    description: raw.description ?? null,
    author: raw.author ?? null,
    notes: raw.notes ?? null,
    mediaUrl: raw.mediaUrl ?? null,
    mediaType: raw.mediaType ?? null,
    files: raw.files ?? [],
    coverIndex: raw.coverIndex,
    width: raw.width ?? null,
    height: raw.height ?? null,
    fileSize: raw.fileSize ?? null,
    tags: raw.tags ?? [],
    rawJson: raw.rawJson ?? undefined,
    status: raw.status,
    ingestStartedAt: toMs(raw.ingestStartedAt) ?? null,
    ingestCompletedAt: toMs(raw.ingestCompletedAt) ?? null,
    tasks: raw.tasks,
    savedAt: toMs(raw.savedAt) ?? Date.now(),
    createdAt: toMs(raw.createdAt) ?? Date.now(),
    deletedAt: toMs(raw.deletedAt),
  };
}

function toMs(v: unknown): number | null {
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
