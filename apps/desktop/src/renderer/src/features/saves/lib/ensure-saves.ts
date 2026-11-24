import { normalise, SavePatchesSchema } from "@/features/saves/lib/reconcile";
import { bulkUpsertSaves, pool } from "@/features/saves/state/pool";
import type { Save } from "@/features/saves/types";

const hydrationVersions = new Map<string, number>();

export function invalidatePendingSaveHydration(
  ids: ReadonlyArray<string>,
): void {
  for (const id of ids) {
    hydrationVersions.set(id, (hydrationVersions.get(id) ?? 0) + 1);
  }
}

function versionsFor(ids: ReadonlyArray<string>): Map<string, number> {
  return new Map(ids.map((id) => [id, hydrationVersions.get(id) ?? 0]));
}

function versionIsCurrent(
  id: string,
  requestedVersions: ReadonlyMap<string, number>,
): boolean {
  return (hydrationVersions.get(id) ?? 0) === requestedVersions.get(id);
}

export async function ensureSaves(ids: ReadonlyArray<string>): Promise<void> {
  const missing: Array<string> = [];
  for (const id of ids) {
    if (!pool.get(id)) {
      missing.push(id);
    }
  }
  if (missing.length === 0) {
    return;
  }
  const requestedVersions = versionsFor(missing);
  const rows = SavePatchesSchema.parse(
    await window.pond.query("saves.getMany", { ids: missing }),
  );
  const normalised = rows
    .map((row) => normalise(row))
    .filter(
      (row): row is Save =>
        row !== null &&
        !pool.get(row.id) &&
        versionIsCurrent(row.id, requestedVersions),
    );
  if (normalised.length > 0) {
    bulkUpsertSaves(normalised);
  }
}

export async function reloadSaves(ids: ReadonlyArray<string>): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const requestedVersions = versionsFor(ids);
  const rows = SavePatchesSchema.parse(
    await window.pond.query("saves.getMany", { ids: [...ids] }),
  );
  const normalised = rows
    .map((row) => normalise(row))
    .filter(
      (row): row is Save =>
        row !== null && versionIsCurrent(row.id, requestedVersions),
    );
  if (normalised.length > 0) {
    bulkUpsertSaves(normalised);
  }
}
