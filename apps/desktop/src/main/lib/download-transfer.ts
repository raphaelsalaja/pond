import type {
  DownloadTransfer,
  ReportDownloadActivity,
} from "@shared/download-activity";

export interface TransferOptions {
  signal?: AbortSignal;
  reportActivity?: ReportDownloadActivity;
}

export class DownloadSizeError extends Error {
  constructor() {
    super("Download exceeds the file size limit");
    this.name = "DownloadSizeError";
  }
}

export async function fetchDownload(
  args: TransferOptions & {
    url: string;
    fileIndex: number;
    fileCount: number;
    maxBytes: number;
    imageMaxBytes?: number | null;
    fetcher?: typeof fetch;
  },
): Promise<{ response: Response; bytes: Buffer | null }> {
  const startedAt = Date.now();
  const idleController = new AbortController();
  const signal = AbortSignal.any([
    idleController.signal,
    ...(args.signal ? [args.signal] : []),
  ]);
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleController.abort(
        new DOMException(
          "Download received no data for 30 seconds",
          "TimeoutError",
        ),
      );
    }, 30_000);
  }
  const transfer: DownloadTransfer = {
    fileIndex: args.fileIndex,
    fileCount: args.fileCount,
    state: "requesting",
    startedAt,
    updatedAt: startedAt,
    request: { method: "GET", host: new URL(args.url).hostname },
  };
  function report(phase: "requesting" | "receiving" | "processing") {
    transfer.updatedAt = Date.now();
    args.reportActivity?.({ phase, transfer: structuredClone(transfer) });
  }
  report("requesting");
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    signal.throwIfAborted();
    resetIdleTimer();
    const response = await (args.fetcher ?? fetch)(args.url, {
      method: "GET",
      redirect: "follow",
      signal,
    });
    resetIdleTimer();
    const mime = response.headers.get("content-type")?.split(";")[0]?.trim();
    transfer.request = {
      method: "GET",
      host: new URL(response.url || args.url).hostname,
      status: response.status,
      responseMs: Date.now() - startedAt,
      contentType: mime,
    };
    report("requesting");
    if (!response.ok) {
      await response.body?.cancel();
      transfer.state = "failed";
      report("processing");
      return { response, bytes: null };
    }
    const maxBytes =
      mime?.startsWith("image/") && args.imageMaxBytes && args.imageMaxBytes > 0
        ? Math.min(args.imageMaxBytes, args.maxBytes)
        : args.maxBytes;
    const length = Number(response.headers.get("content-length"));
    /** Fetch decodes compressed responses, so their wire length is not a body-byte total. */
    if (
      length > 0 &&
      Number.isFinite(length) &&
      !response.headers.get("content-encoding")
    ) {
      transfer.totalBytes = length;
      if (length > maxBytes) {
        await response.body?.cancel();
        throw new DownloadSizeError();
      }
    }
    const chunks: Uint8Array[] = [];
    let received = 0;
    let speedSampleAt = Date.now();
    let speedSampleBytes = 0;
    reader = response.body?.getReader();
    if (reader) {
      while (true) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        signal.throwIfAborted();
        if (value.byteLength === 0) continue;
        resetIdleTimer();
        const now = Date.now();
        transfer.request.firstByteMs ??= now - startedAt;
        received += value.byteLength;
        if (received > maxBytes) throw new DownloadSizeError();
        chunks.push(value);
        transfer.state = "receiving";
        transfer.receivedBytes = received;
        const elapsed = now - speedSampleAt;
        if (elapsed >= 500) {
          transfer.bytesPerSecond =
            (received - speedSampleBytes) / (elapsed / 1000);
          speedSampleAt = now;
          speedSampleBytes = received;
        }
        transfer.etaSeconds =
          transfer.totalBytes && transfer.bytesPerSecond
            ? Math.max(0, transfer.totalBytes - received) /
              transfer.bytesPerSecond
            : undefined;
        report("receiving");
      }
    }
    signal.throwIfAborted();
    transfer.state = "completed";
    transfer.receivedBytes = received;
    transfer.bytesPerSecond = undefined;
    transfer.etaSeconds = undefined;
    report("processing");
    return { response, bytes: Buffer.concat(chunks, received) };
  } catch (error) {
    if (reader) await reader.cancel().catch(() => {});
    transfer.state = "failed";
    transfer.bytesPerSecond = undefined;
    transfer.etaSeconds = undefined;
    report("processing");
    throw error;
  } finally {
    clearTimeout(idleTimer);
    reader?.releaseLock();
  }
}
