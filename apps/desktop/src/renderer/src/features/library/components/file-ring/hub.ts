import { formatPlural } from "@/shared/lib/format";
import { RING_ACTIONS } from "./actions";
import type { RingTarget } from "./slots";

const SAVES = { one: "Save", other: "Saves" };
export const ITEMS = { one: "Item", other: "Items" };

interface HubCopy {
  title: string;
  detail?: string;
}

interface HubFolder {
  id: string;
  name: string;
}

export function hubCopy(
  target: RingTarget<HubFolder> | undefined,
  counts: Partial<Record<string, number>> | null,
  saveCount: number | null,
): HubCopy {
  if (!target) return { title: "File To" };
  if (target.kind === "action")
    return {
      title: RING_ACTIONS[target.action].label,
      detail: saveCount === null ? undefined : formatPlural(saveCount, SAVES),
    };
  const count = counts?.[target.folder.id];
  return {
    title: target.folder.name,
    detail: count === undefined ? undefined : formatPlural(count, ITEMS),
  };
}
