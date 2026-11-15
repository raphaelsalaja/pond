import { IconExport, IconFolderPlus } from "@pond/icons";
import type { FileRingAction } from "@pond/schema/file-ring";

interface ActionCopy {
  label: string;
  Icon: typeof IconExport;
}

export const RING_ACTIONS = {
  "new-folder": { label: "New Folder", Icon: IconFolderPlus },
  "export-files": { label: "Export Files", Icon: IconExport },
} satisfies Record<FileRingAction, ActionCopy>;
