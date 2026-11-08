import { pathToFileURL } from "node:url";
import { ClipboardItem, clipboard } from "electron";

/** Finder and most apps paste a file from `text/uri-list`; plain text keeps the paths for everything else. */
export async function writeFileRefsToClipboard(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await clipboard.write([
    new ClipboardItem({
      "text/plain": paths.join("\n"),
      "text/uri-list": paths
        .map((path) => pathToFileURL(path).href)
        .join("\r\n"),
    }),
  ]);
}
