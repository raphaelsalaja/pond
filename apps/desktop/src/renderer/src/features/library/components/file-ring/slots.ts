import { quickAccessRows } from "../folder-sidebar/folder-tree/quick-access/order";
import type { RingSlot } from "./geometry";

/** Folders fill both sides before the bottom, so a short list still sits balanced. */
export const FOLDER_SLOTS = [
  "left",
  "right",
  "bottom-left",
  "bottom-right",
] as const satisfies readonly RingSlot[];

export const ACTION_SLOTS = [
  "top-left",
  "top-right",
] as const satisfies readonly RingSlot[];

export type RingAction = "new-folder" | "export-files";

const SLOT_ACTIONS = {
  "top-left": "new-folder",
  "top-right": "export-files",
} satisfies Record<(typeof ACTION_SLOTS)[number], RingAction>;

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
  return [...quick, ...recent].slice(0, FOLDER_SLOTS.length);
}

export function layoutRing<Folder>(
  folders: readonly Folder[],
  hasFiles: boolean,
): RingLayout<Folder> {
  const layout: RingLayout<Folder> = {};
  for (const slot of ACTION_SLOTS) {
    const action = SLOT_ACTIONS[slot];
    layout[slot] = {
      kind: "action",
      action,
      disabled: action === "export-files" && !hasFiles,
    };
  }
  for (const [index, slot] of FOLDER_SLOTS.entries()) {
    const folder = folders[index];
    if (folder !== undefined) layout[slot] = { kind: "folder", folder };
  }
  return layout;
}

export function acceptsDrop<Folder>(
  target: RingTarget<Folder> | undefined,
): target is RingTarget<Folder> {
  if (!target) return false;
  return target.kind === "folder" || !target.disabled;
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
