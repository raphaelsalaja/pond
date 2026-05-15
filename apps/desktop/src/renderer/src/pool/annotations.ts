import { pool } from "./pool";
import type { Save, SaveAnnotations, TextHighlight } from "./types";

function emptyAnnotations(): SaveAnnotations {
  return { highlights: [] };
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
