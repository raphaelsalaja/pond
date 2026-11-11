import sharp from "sharp";

/** libvips keeps 50 MB of decoded operations and 20 open files by default, held for the life of a long-running process. */
export function limitSharpMemory(): void {
  sharp.cache({ memory: 16, files: 0, items: 50 });
}
