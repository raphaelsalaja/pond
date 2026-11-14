import {
  IconExport,
  IconFile,
  IconFolderPlus,
  IconLink2,
  IconMagnifier,
  IconNotepad,
} from "@pond/icons";
import type { FileRingAction } from "@pond/schema/file-ring";

interface ActionCopy {
  label: string;
  Icon: typeof IconExport;
}

export const RING_ACTIONS = {
  "new-folder": { label: "New Folder", Icon: IconFolderPlus },
  "export-files": { label: "Export Files", Icon: IconExport },
  search: { label: "Search", Icon: IconMagnifier },
  "new-note": { label: "New Note", Icon: IconNotepad },
  "import-files": { label: "Import Files", Icon: IconFile },
  "import-links": { label: "Import from Links", Icon: IconLink2 },
} satisfies Record<FileRingAction, ActionCopy>;
