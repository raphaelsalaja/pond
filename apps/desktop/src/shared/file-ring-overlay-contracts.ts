import {
  FILE_RING_ACTIONS,
  type FileRingAction,
  type FileRingItem,
} from "@pond/schema/file-ring";
import { z } from "zod";
import type { MenuActionId } from "./constants";
import type { ShellHint } from "./shell-hint";

export const FILE_RING_OVERLAY_IPC = {
  open: "pond:file-ring-overlay-open",
  ready: "pond:file-ring-overlay-ready",
  present: "pond:file-ring-overlay-present",
  activate: "pond:file-ring-overlay-activate",
  drop: "pond:file-ring-overlay-drop",
  dismiss: "pond:file-ring-overlay-dismiss",
} as const;

/** Export Files needs a Library selection, so the overlay has nothing to run it on. */
export function overlayMenuAction(action: FileRingAction): MenuActionId | null {
  switch (action) {
    case "new-folder":
      return "library.new-folder";
    case "search":
      return "library.search";
    case "new-note":
      return "library.new-note";
    case "import-files":
      return "library.import-files";
    case "import-links":
      return "library.import-links";
    case "export-files":
      return null;
  }
}

export interface FileRingOverlayFolder {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  icon?: string;
  quickAccess?: boolean;
  quickAccessOrder?: number;
}

export interface FileRingOverlaySnapshot {
  /** Null keeps the automatic ring, which the overlay fills from its own recent folders. */
  items: FileRingItem[] | null;
  folders: FileRingOverlayFolder[];
  counts: Record<string, number>;
  shell: ShellHint;
}

const IdSchema = z.string().min(1).max(1024);

export const FileRingOverlayActivateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("folder"), folderId: IdSchema }),
  z.object({ kind: z.literal("action"), action: z.enum(FILE_RING_ACTIONS) }),
]);
export type FileRingOverlayActivate = z.infer<
  typeof FileRingOverlayActivateSchema
>;

export const FileRingOverlayDropSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("files"),
    folderId: IdSchema,
    paths: z.array(z.string().min(1).max(4096)).min(1).max(500),
  }),
  z.object({
    kind: z.literal("urls"),
    folderId: IdSchema,
    urls: z.array(z.string().url().max(8192)).min(1).max(100),
  }),
]);
export type FileRingOverlayDrop = z.infer<typeof FileRingOverlayDropSchema>;

export type FileRingOverlayDropResult =
  | { ok: true; kind: "files" | "urls"; imported: number; failed: number }
  | { ok: false; reason: "folder_unavailable" };
