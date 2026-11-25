import { constants, createReadStream } from "node:fs";
import { copyFile, readFile, stat, writeFile } from "node:fs/promises";

export interface LibraryMediaMetadata {
  originalSize: number;
}

export async function writeLibraryMedia(
  path: string,
  bytes: Uint8Array,
): Promise<void> {
  await writeFile(path, bytes);
}

export async function copyLibraryMediaFile(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  await copyFile(inputPath, outputPath);
}

export async function libraryMediaMetadata(
  path: string,
): Promise<LibraryMediaMetadata> {
  return { originalSize: (await stat(path)).size };
}

export async function* readLibraryMediaRange(input: {
  path: string;
  start: number;
  endExclusive: number;
}): AsyncGenerator<Buffer> {
  if (input.start === input.endExclusive) return;
  const stream = createReadStream(input.path, {
    start: input.start,
    end: input.endExclusive - 1,
  });
  for await (const chunk of stream) {
    yield Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  }
}

export async function readLibraryMedia(path: string): Promise<Buffer> {
  return readFile(path);
}

export async function exportLibraryMedia(
  sourcePath: string,
  outputPath: string,
): Promise<void> {
  await copyFile(sourcePath, outputPath, constants.COPYFILE_EXCL);
}
