import type { OpenDialogOptions, OpenDialogReturnValue } from "electron";
import { z } from "zod";

export const ImportKindSchema = z.enum(["files", "folders"]);
type ImportKind = z.infer<typeof ImportKindSchema>;

interface ImportDialog<Window> {
  focusedWindow: () => Window | null;
  open: (
    window: Window | null,
    options: OpenDialogOptions,
  ) => Promise<OpenDialogReturnValue>;
}

export function createImportPicker<Window>(dialog: ImportDialog<Window>) {
  return async (kind: ImportKind): Promise<{ paths: Array<string> }> => {
    const mode = ImportKindSchema.parse(kind);
    const options: OpenDialogOptions = {
      title: mode === "folders" ? "Import Folders" : "Import Files",
      buttonLabel: "Import",
      properties: [
        mode === "folders" ? "openDirectory" : "openFile",
        "multiSelections",
      ],
    };
    const result = await dialog.open(dialog.focusedWindow(), options);
    return { paths: result.canceled ? [] : result.filePaths };
  };
}

export async function pickImportPaths(
  kind: ImportKind,
): Promise<{ paths: Array<string> }> {
  const { BrowserWindow, dialog } = await import("electron");
  return createImportPicker({
    focusedWindow: () => BrowserWindow.getFocusedWindow(),
    open: (window, options) =>
      window
        ? dialog.showOpenDialog(window, options)
        : dialog.showOpenDialog(options),
  })(kind);
}
