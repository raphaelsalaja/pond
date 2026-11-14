import type { FileRingAction, FileRingItem } from "@pond/schema/file-ring";
import { quickAccessRows } from "../folder-sidebar/folder-tree/quick-access/order";
import { RING_SLOTS, type RingSlot } from "./geometry";

/** Items fill the top first, then both sides before the bottom, so a short ring still sits balanced. */
export const RING_FILL = [
  "top-left",
  "top-right",
  "left",
  "right",
  "bottom-left",
  "bottom-right",
] as const satisfies readonly RingSlot[];

const SLOT_NAMES = {
  "top-left": "Top Left",
  "top-right": "Top Right",
  left: "Left",
  right: "Right",
  "bottom-left": "Bottom Left",
  "bottom-right": "Bottom Right",
} satisfies Record<RingSlot, string>;

/** The sector the item at this position in the list fills. */
export function ringSlotName(index: number): string | null {
  const slot = RING_FILL[index];
  return slot ? SLOT_NAMES[slot] : null;
}

const AUTO_ACTIONS = [
  { kind: "action", action: "new-folder" },
  { kind: "action", action: "export-files" },
] as const satisfies readonly FileRingItem[];

export type RingAction = FileRingAction;

export type RingTarget<Folder> =
  | { kind: "folder"; folder: Folder }
  | { kind: "action"; action: RingAction; disabled: boolean };

export interface RingLayout<Folder> {
  "top-left"?: RingTarget<Folder>;
  "top-right"?: RingTarget<Folder>;
  right?: RingTarget<Folder>;
  "bottom-right"?: RingTarget<Folder>;
  "bottom-left"?: RingTarget<Folder>;
  left?: RingTarget<Folder>;
}

interface RingFolderRow {
  id: string;
  name: string;
  sortOrder: number;
}

interface QuickAccessPresentation {
  quickAccess?: boolean;
  quickAccessOrder?: number;
}

export function pickRingFolders<Row extends RingFolderRow>(
  rows: readonly Row[],
  presentations: Partial<Record<string, QuickAccessPresentation>>,
  recentIds: readonly string[],
): Row[] {
  const quick = quickAccessRows(rows, presentations);
  const picked = new Set(quick.map((row) => row.id));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const recent = recentIds.flatMap((id) => {
    const row = byId.get(id);
    if (!row || picked.has(id)) return [];
    picked.add(id);
    return [row];
  });
  return [...quick, ...recent].slice(0, RING_FILL.length - AUTO_ACTIONS.length);
}

/** New Folder and Export Files on top, then Quick Access and recent folders, for a ring nobody has customized. */
export function autoRingItems<Row extends RingFolderRow>(
  rows: readonly Row[],
  presentations: Partial<Record<string, QuickAccessPresentation>>,
  recentIds: readonly string[],
): FileRingItem[] {
  const folders = pickRingFolders(rows, presentations, recentIds);
  return [
    ...AUTO_ACTIONS,
    ...folders.map((row) => ({ kind: "folder" as const, folderId: row.id })),
  ];
}

/** A folder that no longer exists leaves its sector empty, so the rest of the ring stays where you learned it. */
export function layoutRing<Folder extends { id: string }>(
  items: readonly FileRingItem[],
  folders: readonly Folder[],
  hasFiles: boolean,
): RingLayout<Folder> {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const layout: RingLayout<Folder> = {};
  for (const [index, item] of items.entries()) {
    const slot = RING_FILL[index];
    if (!slot) break;
    if (item.kind === "action") {
      layout[slot] = {
        kind: "action",
        action: item.action,
        disabled: item.action === "export-files" && !hasFiles,
      };
      continue;
    }
    const folder = byId.get(item.folderId);
    if (folder) layout[slot] = { kind: "folder", folder };
  }
  return layout;
}

export function acceptsDrop<Folder>(
  target: RingTarget<Folder> | undefined,
): target is RingTarget<Folder> {
  if (!target) return false;
  return target.kind === "folder" || !target.disabled;
}

/** The automatic ring waits for a folder to file into; a customized one opens whenever any sector takes the drop. */
export function ringOpens<Folder>(
  layout: RingLayout<Folder>,
  customized: boolean,
): boolean {
  const targets = RING_SLOTS.map((slot) => layout[slot]).filter(acceptsDrop);
  return customized
    ? targets.length > 0
    : targets.some((target) => target.kind === "folder");
}

export interface RingDropHandlers<Folder, Payload> {
  addToFolder: (payload: Payload, folder: Folder) => void;
  createFolder: (payload: Payload) => void;
  exportFiles?: (payload: Payload) => void;
}

export function dropOnRing<Folder, Payload>(
  target: RingTarget<Folder> | undefined,
  payload: Payload,
  handlers: RingDropHandlers<Folder, Payload>,
): boolean {
  if (!acceptsDrop(target)) return false;
  if (target.kind === "folder") handlers.addToFolder(payload, target.folder);
  else if (target.action === "new-folder") handlers.createFolder(payload);
  else if (handlers.exportFiles) handlers.exportFiles(payload);
  else return false;
  return true;
}
