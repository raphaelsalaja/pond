import type {
  FileRingOverlayDrop,
  FileRingOverlayDropResult,
} from "../../../shared/file-ring-overlay-contracts";

interface FileImport {
  ids: string[];
  failed: number;
}

export interface OverlayDropDeps {
  hasFolder: (id: string) => Promise<boolean>;
  /** Files dragged out of the Library are Saves already, so they file instead of importing twice. */
  saveIdFor: (path: string) => string | null;
  addSaves: (folderId: string, ids: string[]) => Promise<void>;
  importFiles: (paths: string[], folderId: string) => Promise<FileImport>;
  quickAdd: (url: string, folderId: string) => Promise<boolean>;
}

export async function dropIntoFolder(
  drop: FileRingOverlayDrop,
  deps: OverlayDropDeps,
): Promise<FileRingOverlayDropResult> {
  if (!(await deps.hasFolder(drop.folderId)))
    return { ok: false, reason: "folder_unavailable" };
  if (drop.kind === "urls") {
    const added = await Promise.all(
      drop.urls.map((url) => deps.quickAdd(url, drop.folderId)),
    );
    const imported = added.filter(Boolean).length;
    return {
      ok: true,
      kind: "urls",
      imported,
      failed: added.length - imported,
    };
  }
  const matched = drop.paths.map((path) => ({
    path,
    id: deps.saveIdFor(path),
  }));
  const saveIds = matched.flatMap((file) => (file.id ? [file.id] : []));
  const outside = matched.flatMap((file) => (file.id ? [] : [file.path]));
  if (saveIds.length > 0) await deps.addSaves(drop.folderId, saveIds);
  const imports =
    outside.length > 0
      ? await deps.importFiles(outside, drop.folderId)
      : { ids: [], failed: 0 };
  return {
    ok: true,
    kind: "files",
    imported: saveIds.length + imports.ids.length,
    failed: imports.failed,
  };
}
