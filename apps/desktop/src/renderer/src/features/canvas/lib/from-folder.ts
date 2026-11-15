import {
  CANVAS_ITEM_LIMIT,
  type CanvasSummary,
} from "@shared/canvas-contracts";
import { formatNumber, formatPlural } from "@/shared/lib/format";

interface FolderSavesPlan {
  saveIds: string[];
  present: number;
  overflow: number;
}

interface Notice {
  title: string;
  description?: string;
}

/** Folder Saves that fit on the Canvas, skipping ones already there. */
export function planFolderSaves(
  saveIds: readonly string[],
  canvas?: Pick<CanvasSummary, "saveIds" | "itemCount">,
): FolderSavesPlan {
  const onCanvas = new Set(canvas?.saveIds ?? []);
  const unique = [...new Set(saveIds)];
  const fresh = unique.filter((id) => !onCanvas.has(id));
  const room = Math.max(0, CANVAS_ITEM_LIMIT - (canvas?.itemCount ?? 0));
  return {
    saveIds: fresh.slice(0, room),
    present: unique.length - fresh.length,
    overflow: Math.max(0, fresh.length - room),
  };
}

function savesCopy(count: number): string {
  return formatPlural(count, { one: "Save", other: "Saves" });
}

function overflowCopy(overflow: number): string {
  return `A canvas holds up to ${formatNumber(CANVAS_ITEM_LIMIT)} items, so ${savesCopy(overflow)} didn't fit.`;
}

export function folderSavesNotice(name: string, plan: FolderSavesPlan): Notice {
  const added = plan.saveIds.length;
  if (!added && plan.overflow)
    return {
      title: `"${name}" is full`,
      description: overflowCopy(plan.overflow),
    };
  if (!added)
    return {
      title: `Already on "${name}"`,
      description: "Every Save in this folder is on the canvas.",
    };
  const details = [
    plan.present
      ? `Skipped ${savesCopy(plan.present)} already on the canvas.`
      : undefined,
    plan.overflow ? overflowCopy(plan.overflow) : undefined,
  ].filter(Boolean);
  return {
    title: `Added ${savesCopy(added)} to "${name}"`,
    description: details.length ? details.join(" ") : undefined,
  };
}
