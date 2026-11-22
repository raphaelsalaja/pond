import { createWriteStream } from "node:fs";
import { readdir, rename, rm, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { ZipFile } from "yazl";
import {
  checkTransferCancellation,
  transferPhase,
  transferProgress,
} from "./transfer-jobs";

async function listFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(root, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (entry.isFile()) files.push(join(entry.parentPath, entry.name));
  }
  return files.sort();
}

/** Writes `source` into a ZIP at `destination`, with `source`'s own folder as the archive's top level. */
export async function zipDirectory(source: string, destination: string) {
  const files = await listFiles(source);
  await transferPhase("Compressing", files.length);
  const parent = join(source, "..");
  const zip = new ZipFile();
  const partial = `${destination}.partial`;
  await rm(partial, { force: true });
  const output = createWriteStream(partial, { flags: "wx" });
  const written = pipeline(zip.outputStream, output);
  try {
    for (const path of files) {
      checkTransferCancellation();
      const { size } = await stat(path);
      zip.addFile(path, relative(parent, path).split(sep).join("/"), {
        compress: path.endsWith(".json"),
      });
      await transferProgress(path, size);
    }
    zip.end();
    await written;
    checkTransferCancellation();
    await rename(partial, destination);
  } catch (error) {
    output.destroy();
    await written.catch(() => {});
    await rm(partial, { force: true });
    throw error;
  }
}
