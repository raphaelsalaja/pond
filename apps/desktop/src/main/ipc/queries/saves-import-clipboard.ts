import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clipboard, nativeImage } from "electron";
import log from "electron-log/main.js";
import { importFiles } from "../../core/import-files";
import type { QueryHandlerMap } from "./params";
import { normalizeClipboardFilePaths } from "./saves-import-input";

async function clipboardFilePaths(): Promise<string[]> {
  const uriLists: string[] = [];
  let plainText: string | null = null;

  try {
    const items = await clipboard.read();
    for (const item of items) {
      if (!item.types.includes("text/uri-list")) continue;
      const payload = await item.getType("text/uri-list");
      if (payload instanceof Blob) uriLists.push(await payload.text());
    }
  } catch (error) {
    log.warn("[pond ipc] clipboard file read failed", error);
  }

  try {
    plainText = await clipboard.readText();
  } catch (error) {
    log.warn("[pond ipc] clipboard text read failed", error);
  }

  return normalizeClipboardFilePaths(uriLists.join("\n"), plainText);
}

export async function readClipboardImage() {
  const items = await clipboard.read();
  for (const type of ["image/png", "image/jpeg"]) {
    const item = items.find((candidate) => candidate.types.includes(type));
    if (!item) continue;
    const payload = await item.getType(type);
    if (!(payload instanceof Blob)) continue;
    const image = nativeImage.createFromBuffer(
      Buffer.from(await payload.arrayBuffer()),
    );
    if (!image.isEmpty()) return image;
  }
  return nativeImage.createEmpty();
}

export const savesImportClipboardQueries = {
  async "saves.importClipboard"() {
    const filePaths = await clipboardFilePaths();
    if (filePaths.length > 0) {
      return importFiles({
        paths: filePaths,
        tags: [],
        folderIds: [],
        origin: "clipboard",
      });
    }

    const image = await readClipboardImage();
    if (image.isEmpty()) {
      return { ok: false, error: "empty_clipboard", ids: [] };
    }

    try {
      const directory = await mkdtemp(join(tmpdir(), "pond-clip-"));
      const path = join(directory, "clipboard.png");
      await writeFile(path, image.toPNG());
      return importFiles({
        paths: [path],
        tags: [],
        folderIds: [],
        origin: "clipboard",
      });
    } catch (error) {
      log.warn("[pond ipc] importClipboard failed", error);
      return { ok: false, error: "clipboard_write_failed", ids: [] };
    }
  },
} satisfies QueryHandlerMap;
