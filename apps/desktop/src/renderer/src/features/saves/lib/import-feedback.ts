export type ImportKind = "files" | "urls" | "clipboard";

export interface ImportOutcome {
  kind: ImportKind;
  imported: number;
  failed: number;
  folderName?: string;
}

export interface ImportToast {
  title: string;
  description?: string;
}

/** The only types a drag from another app exposes before drop; its data stays unreadable until then. */
const IMPORTABLE_TYPES = ["Files", "text/uri-list", "text/plain"];

export function canImportDrop(types: Iterable<string>): boolean {
  return [...types].some((type) => IMPORTABLE_TYPES.includes(type));
}

function successTitle({ kind, imported, folderName }: ImportOutcome): string {
  if (kind === "urls") {
    const base =
      imported === 1 ? "Downloading" : `Downloading ${imported} links`;
    return folderName ? `${base} to "${folderName}"` : base;
  }
  const place = folderName ? `"${folderName}"` : "Pond";
  return imported === 1
    ? `Saved to ${place}`
    : `Saved ${imported} items to ${place}`;
}

function failedDescription({ kind, failed }: ImportOutcome): string {
  const noun = kind === "urls" ? "link" : "file";
  return failed === 1
    ? `1 ${noun} couldn't be imported.`
    : `${failed} ${noun}s couldn't be imported.`;
}

export function importToast(outcome: ImportOutcome): ImportToast | null {
  if (outcome.imported > 0) {
    const title = successTitle(outcome);
    if (outcome.failed === 0) return { title };
    return { title, description: failedDescription(outcome) };
  }
  if (outcome.failed === 0) return null;
  return {
    title: outcome.folderName
      ? `Couldn't save to "${outcome.folderName}"`
      : "Couldn't save to Pond",
    description:
      outcome.kind === "urls"
        ? "Check that the link opens in a browser, then try again."
        : "Check that the files still exist, then try again.",
  };
}

export const UNSUPPORTED_DROP: ImportToast = {
  title: "Couldn't import this drop",
  description: "Drop files, images or links from another app.",
};
