import type { QuickCaptureSnapshot } from "../../../../shared/quick-capture-contracts";

export interface QuickCaptureFields {
  text: string;
  title: string;
  paths: string[];
  folderId: string | null;
}

/** A kept draft wins over the clipboard, minus a folder deleted while the window was hidden. */
export function initialFields(
  snapshot: QuickCaptureSnapshot,
): QuickCaptureFields {
  const { draft, folders } = snapshot;
  if (!draft)
    return { text: snapshot.clipboard, title: "", paths: [], folderId: null };
  const folderId = folders.some((folder) => folder.id === draft.folderId)
    ? draft.folderId
    : null;
  return {
    text: draft.text,
    title: draft.title ?? "",
    paths: draft.paths,
    folderId,
  };
}
