import {
  isManualSensitiveDecision,
  MANUAL_LIKELY_SENSITIVE_MODEL,
  MANUAL_NOT_SENSITIVE_MODEL,
  manualSensitiveDecision,
  sensitiveContentBand,
} from "@pond/schema/content-safety";
import { pool } from "@/features/saves/state/pool";
import type { Save } from "@/features/saves/types";
import { notify } from "@/shared/lib/toast";

export function saveMarkedSensitive(save: Save): boolean {
  if (save.sensitiveModel === MANUAL_NOT_SENSITIVE_MODEL) return false;
  if (save.sensitiveModel === MANUAL_LIKELY_SENSITIVE_MODEL) return true;
  const band = sensitiveContentBand(save.sensitiveScore);
  return band === "likely-sensitive" || band === "possible-sensitive";
}

export function saveHasSensitiveResult(save: Save): boolean {
  return (
    save.sensitiveScore != null ||
    isManualSensitiveDecision(save.sensitiveModel)
  );
}

export async function setSensitiveDecision(
  ids: readonly string[],
  sensitive: boolean,
): Promise<void> {
  const targets = [...new Set(ids)];
  if (targets.length === 0) return;
  const patch = manualSensitiveDecision(sensitive);
  const before = targets.flatMap((id) => {
    const save = pool.get(id);
    return save ? [save] : [];
  });
  if (before.length > 0) {
    pool.bulkUpsert(before.map((save) => ({ ...save, ...patch })));
  }
  try {
    await Promise.all(
      targets.map((id) =>
        window.pond.query("saves.patchDerived", { id, patch }),
      ),
    );
  } catch {
    pool.bulkUpsert(before.filter((save) => pool.get(save.id) !== save));
    notify({
      id: "sensitive-content",
      title: "Couldn't update sensitive content",
    });
  }
}
