import { createReadStream, createWriteStream } from "node:fs";
import type { ReadStream } from "node:fs";
import { readdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { finished, pipeline } from "node:stream/promises";
import { ZipFile } from "yazl";
import {
  checkTransferCancellation,
  transferPhase,
  transferProgress,
} from "./transfer-jobs";

async function listFiles(root: string) {
  const files: Array<{ path: string; size: number }> = [];
  for (const entry of await readdir(root, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files.push({ path, size: (await stat(path)).size });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/** Writes `source` into a ZIP at `destination`, with `source`'s own folder as the archive's top level. */
export async function zipDirectory(source: string, destination: string) {
  const files = await listFiles(source);
  await transferPhase("Compressing", files.length);
  const parent = dirname(source);
  const zip = new ZipFile();
  const partial = `${destination}.partial`;
  await rm(partial, { force: true });
  const output = createWriteStream(partial, { flags: "wx" });
  /** yazl reports entry failures on the ZipFile, not its output stream. */
  const failed = new Promise<never>((_, reject) => {
    zip.once("error", reject);
  });
  const written = Promise.race([pipeline(zip.outputStream, output), failed]);
  let input: ReadStream | null = null;
  try {
    for (const { path, size } of files) {
      checkTransferCancellation();
      const current = createReadStream(path);
      input = current;
      zip.addReadStreamLazy(
        relative(parent, path).split(sep).join("/"),
        { compress: path.endsWith(".json"), size },
        (callback) => callback(null, current),
      );
      await Promise.race([finished(current), written]);
      await transferProgress(path, size);
    }
    zip.end();
    await written;
    checkTransferCancellation();
    await rename(partial, destination);
  } catch (error) {
    input?.destroy();
    output.destroy();
    await written.catch(() => {});
    await rm(partial, { force: true });
    throw error;
  }
}
