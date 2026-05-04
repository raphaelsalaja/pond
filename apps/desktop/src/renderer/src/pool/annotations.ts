import { pool } from "./pool";
import type {
  Save,
  SaveAnnotations,
  TextHighlight,
  VideoTimestamp,
} from "./types";

/**
 * Helpers for mutating `save.annotations`. All writes route through
 * `window.pond.tx` with the shape the executor already understands —
 * `update / save / { patch: { annotations } }` — so they show up in
 * the sync actions log and undo stack just like any other field edit.
 *
 * We always pass `before` so undo is symmetrical: re-applying the
 * pre-tx annotations restores the exact set of highlights /
 * timestamps the user had before the latest action.
 */

function emptyAnnotations(): SaveAnnotations {
  return { highlights: [], videoTimestamps: [] };
}

function mergeAnnotations(
  prev: SaveAnnotations | null | undefined,
  patch: Partial<SaveAnnotations>,
): SaveAnnotations {
  const base = { ...emptyAnnotations(), ...(prev ?? {}) };
  return { ...base, ...patch };
}

export function rid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function commitAnnotations(
  save: Save,
  next: SaveAnnotations,
): Promise<void> {
  const before = save.annotations ?? null;
  await window.pond.tx({
    kind: "update",
    model: "save",
    id: save.id,
    patch: { annotations: next },
    before: { annotations: before },
    meta: { actor: "user", actorReason: "annotation" },
  });
  // Optimistic local update so the UI doesn't flash; the sync action
  // round-trip will arrive immediately after and idempotently overwrite
  // with the same values.
  pool.upsert({ ...save, annotations: next });
}

export async function addHighlight(
  save: Save,
  draft: Omit<TextHighlight, "id" | "createdAt">,
): Promise<TextHighlight> {
  const created: TextHighlight = {
    id: rid("hl"),
    createdAt: new Date().toISOString(),
    ...draft,
  };
  const next = mergeAnnotations(save.annotations, {
    highlights: [...(save.annotations?.highlights ?? []), created],
  });
  await commitAnnotations(save, next);
  return created;
}

export async function removeHighlight(save: Save, id: string): Promise<void> {
  const next = mergeAnnotations(save.annotations, {
    highlights: (save.annotations?.highlights ?? []).filter((h) => h.id !== id),
  });
  await commitAnnotations(save, next);
}

export async function updateHighlightNote(
  save: Save,
  id: string,
  note: string,
): Promise<void> {
  const next = mergeAnnotations(save.annotations, {
    highlights: (save.annotations?.highlights ?? []).map((h) =>
      h.id === id ? { ...h, note } : h,
    ),
  });
  await commitAnnotations(save, next);
}

export async function addVideoTimestamp(
  save: Save,
  at: number,
  text?: string,
): Promise<VideoTimestamp> {
  const created: VideoTimestamp = {
    at,
    text,
    createdAt: new Date().toISOString(),
  };
  const next = mergeAnnotations(save.annotations, {
    videoTimestamps: [
      ...(save.annotations?.videoTimestamps ?? []),
      created,
    ].sort((a, b) => a.at - b.at),
  });
  await commitAnnotations(save, next);
  return created;
}

export async function removeVideoTimestamp(
  save: Save,
  at: number,
): Promise<void> {
  const next = mergeAnnotations(save.annotations, {
    videoTimestamps: (save.annotations?.videoTimestamps ?? []).filter(
      (t) => Math.abs(t.at - at) > 0.5,
    ),
  });
  await commitAnnotations(save, next);
}
