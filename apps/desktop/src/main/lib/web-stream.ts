import { open } from "node:fs/promises";

/** Matches `createReadStream`'s default high-water mark. */
const FILE_CHUNK_BYTES = 64 * 1024;

/** Pulls one chunk per read, so a slow `Response` consumer never buffers the whole source. */
export function webByteStream(
  chunks: AsyncIterable<Uint8Array>,
): ReadableStream<Uint8Array> {
  const iterator = chunks[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next();
      if (next.done) {
        controller.close();
      } else {
        controller.enqueue(next.value);
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

export async function* fileChunks(path: string): AsyncGenerator<Uint8Array> {
  const handle = await open(path, "r");
  try {
    for (;;) {
      const buffer = Buffer.allocUnsafe(FILE_CHUNK_BYTES);
      const { bytesRead } = await handle.read(
        buffer,
        0,
        FILE_CHUNK_BYTES,
        null,
      );
      if (bytesRead === 0) {
        return;
      }
      yield buffer.subarray(0, bytesRead);
    }
  } finally {
    await handle.close();
  }
}
