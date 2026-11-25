import { Store } from "@tanstack/store";

interface ConversionDialogState {
  id: string;
  ids: ReadonlyArray<string>;
  fileIndex: number;
  mode: ExportMode;
}

export type ExportMode =
  | "files"
  | "converted"
  | "eagle-package"
  | "pond-package"
  | "csv";
export const conversionDialogStore = new Store<ConversionDialogState | null>(
  null,
);
export function openConversionDialog(
  ids: ReadonlyArray<string>,
  fileIndex = 0,
  mode: ExportMode = "converted",
): void {
  if (ids.length) {
    conversionDialogStore.setState(() => ({
      id: crypto.randomUUID(),
      ids: [...new Set(ids)],
      fileIndex,
      mode,
    }));
  }
}
export function closeConversionDialog(): void {
  conversionDialogStore.setState(() => null);
}
