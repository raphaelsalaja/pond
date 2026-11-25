import type { QuickCaptureFolder } from "../../../../shared/quick-capture-contracts";

export interface QuickCaptureFolderOption {
  folder: QuickCaptureFolder;
  depth: number;
}

/** Folders in sidebar order, each under its parent. */
export function folderOptions(
  folders: ReadonlyArray<QuickCaptureFolder>,
): Array<QuickCaptureFolderOption> {
  const ids = new Set(folders.map((folder) => folder.id));
  const children = new Map<string | null, Array<QuickCaptureFolder>>();
  for (const folder of folders) {
    const parent =
      folder.parentId && ids.has(folder.parentId) ? folder.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), folder]);
  }
  const out: Array<QuickCaptureFolderOption> = [];
  const seen = new Set<string>();
  const visit = (parent: string | null, depth: number) => {
    const rows = [...(children.get(parent) ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    );
    for (const folder of rows) {
      if (seen.has(folder.id)) continue;
      seen.add(folder.id);
      out.push({ folder, depth });
      visit(folder.id, depth + 1);
    }
  };
  visit(null, 0);
  return out;
}
