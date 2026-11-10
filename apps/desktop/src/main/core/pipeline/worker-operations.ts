import { readFile } from "node:fs/promises";
import { extractFirstFrame } from "../../lib/ffmpeg-frame";
import { probeImageDims, processImage } from "../../lib/image-process";
import type {
  QueueWorkerRequest,
  QueueWorkerResponse,
} from "./worker-contract";

/**
 * Runs one queue worker request. The utility process and the in-process
 * fallback share this so both paths behave the same.
 */
export async function executeQueueWorkerRequest(
  request: QueueWorkerRequest,
): Promise<QueueWorkerResponse> {
  const identity = {
    jobId: request.jobId,
    leaseToken: request.leaseToken,
    cancellationFence: request.cancellationFence,
  };
  try {
    switch (request.operation) {
      case "process_image": {
        const result = await processImage(
          Buffer.from(request.bytes),
          request.filename,
          request.mimeType,
          request.prefs,
        );
        return {
          ...identity,
          ok: true,
          result: result
            ? { ...result, bytes: new Uint8Array(result.bytes) }
            : null,
        };
      }
      case "probe_image": {
        const result = await probeImageDims(Buffer.from(request.bytes));
        return { ...identity, ok: true, result };
      }
      case "build_poster": {
        const frame = await extractFirstFrame(request.sourcePath);
        if (!frame) {
          return { ...identity, ok: true, result: null };
        }
        try {
          const bytes = await readFile(frame.path);
          if (bytes.byteLength === 0) {
            return { ...identity, ok: true, result: null };
          }
          const dims = await probeImageDims(bytes);
          return {
            ...identity,
            ok: true,
            result: {
              kind: "poster",
              filename: request.filename,
              bytes: new Uint8Array(bytes),
              mimeType: frame.mimeType,
              ...dims,
            },
          };
        } finally {
          await frame.cleanup();
        }
      }
    }
  } catch (error) {
    return {
      ...identity,
      ok: false,
      error: {
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
