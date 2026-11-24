import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { clipboard, nativeImage } from "electron";
import log from "electron-log/main.js";
import { z } from "zod";
import { importFiles } from "../../core/import-files";
import { NullableStringParam, query, StringListParam } from "./params";
import type { QueryHandlerMap } from "./params";
import { normalizeClipboardFilePaths } from "./saves-import-input";

async function clipboardFilePaths(): Promise<Array<string>> {
  const uriLists: Array<string> = [];
  let plainText: string | null = null;

  try {
    const items = await clipboard.read();
    for (const item of items) {
      if (!item.types.includes("text/uri-list")) {
        continue;
      }
      const payload = await item.getType("text/uri-list");
      if ("arrayBuffer" in payload) {
        uriLists.push(await payload.text());
      }
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
    if (!item) {
      continue;
    }
    const payload = await item.getType(type);
    if (!("arrayBuffer" in payload)) {
      continue;
    }
    const image = nativeImage.createFromBuffer(
      Buffer.from(await payload.arrayBuffer()),
    );
    if (!image.isEmpty()) {
      return image;
    }
  }
  return nativeImage.createEmpty();
}

/** Only these temporary PNGs may be discarded, never files copied from Finder. */
const stagedImages = new Set<string>();

/** The pasted files, or the pasted image written to a temporary PNG, so they can go through duplicate review before import. */
async function stageClipboard(): Promise<
  { ok: true; paths: Array<string> } | { ok: false; error: string }
> {
  const filePaths = await clipboardFilePaths();
  if (filePaths.length > 0) {
    return { ok: true, paths: filePaths };
  }
  const image = await readClipboardImage();
  if (image.isEmpty()) {
    return { ok: false, error: "empty_clipboard" };
  }
  try {
    const directory = await mkdtemp(join(tmpdir(), "pond-clip-"));
    const path = join(directory, "clipboard.png");
    await writeFile(path, image.toPNG());
    stagedImages.add(path);
    return { ok: true, paths: [path] };
  } catch (error) {
    log.warn("[pond ipc] stageClipboard failed", error);
    return { ok: false, error: "clipboard_write_failed" };
  }
}

async function discardStagedClipboard(paths: ReadonlyArray<string>) {
  for (const path of paths) {
    if (!stagedImages.delete(path)) {
      continue;
    }
    try {
      await rm(dirname(path), { recursive: true, force: true });
    } catch (error) {
      log.warn("[pond ipc] discardStagedClipboard failed", error);
    }
  }
  return { ok: true as const };
}

export const savesImportClipboardQueries = {
  "saves.importClipboard": query(
    z.object({ folderId: NullableStringParam }),
    async ({ folderId }) => {
      const folderIds = folderId ? [folderId] : [];
      const filePaths = await clipboardFilePaths();
      if (filePaths.length > 0) {
        return importFiles({
          paths: filePaths,
          tags: [],
          folderIds,
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
        return await importFiles({
          paths: [path],
          tags: [],
          folderIds,
          origin: "clipboard",
        });
      } catch (error) {
        log.warn("[pond ipc] importClipboard failed", error);
        return { ok: false, error: "clipboard_write_failed", ids: [] };
      }
    },
  ),
  "saves.stageClipboard": query(z.object({}), () => stageClipboard()),
  "saves.discardStagedClipboard": query(
    z.object({ paths: StringListParam }),
    ({ paths }) => discardStagedClipboard(paths),
  ),
} satisfies QueryHandlerMap;
