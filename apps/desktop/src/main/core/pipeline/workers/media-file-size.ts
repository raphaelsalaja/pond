import type { WriteFileArgs } from "./apply";

/**
 * Library views display `fileSize` instead of summing files. A download
 * adds files and may replace some, so the stored size has to match what remains.
 */
export function fileSizeAfterMediaWrite(
  existing: readonly { kind: string; size: number }[] | null | undefined,
  newFiles: readonly WriteFileArgs[],
  replaceKinds: readonly string[],
): number {
  const replaced = new Set(replaceKinds);
  const retained = (existing ?? []).reduce(
    (total, file) => (replaced.has(file.kind) ? total : total + file.size),
    0,
  );
  const added = newFiles.reduce(
    (total, file) => total + (file.bytes?.byteLength ?? 0),
    0,
  );
  return retained + added;
}
