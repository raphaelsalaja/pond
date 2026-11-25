import type { ImageCrop } from "@pond/schema/db";
import { mutateSave } from "@/features/saves/lib/mutate";
import type { SaveEdit } from "@/features/saves/lib/mutate";
import type { Save } from "@/features/saves/types";

export function rotatePatch(save: Save, delta: number): SaveEdit {
  return { rotate: ((((save.rotate ?? 0) + delta) % 360) + 360) % 360 };
}

export function flipPatch(save: Save, axis: "x" | "y"): SaveEdit {
  return axis === "x" ? { flipX: !save.flipX } : { flipY: !save.flipY };
}

export function cropPatch(crop: ImageCrop): SaveEdit {
  return { crop };
}

export async function applyInspect(
  id: string,
  patch: SaveEdit,
  reason: string,
): Promise<void> {
  await mutateSave(id, patch, { actorReason: reason });
}
