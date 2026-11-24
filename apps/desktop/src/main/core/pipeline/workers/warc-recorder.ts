import { once } from "node:events";
import { createWriteStream } from "node:fs";
import type { WriteStream } from "node:fs";
import type { JsonValue } from "@pond/schema/json";
import type { WebContents } from "electron";
import log from "electron-log/main.js";
import { WARCRecord, WARCSerializer } from "warcio";
import { z } from "zod";
import { readResponseBodyWithinBudget } from "../../../lib/response-body";

const MAX_BODY_BYTES = 30 * 1024 * 1024;
const MAX_TOTAL_BYTES = 250 * 1024 * 1024;
/** CDP commands can hang forever on a wedged window; a hung getResponseBody would otherwise stall the crawl into the watchdog. */
const CDP_TIMEOUT_MS = 10_000;
const FLUSH_BUDGET_MS = 15_000;
const FULL_BODY_TIMEOUT_MS = 30_000;
/** Full bodies share one archive budget, so reads are serialized to avoid buffering the same remaining bytes concurrently. */
const FULL_BODY_CONCURRENCY = 1;

/** The race already surfaced this rejection, or the timeout won and the late rejection has no caller left to hear it. */
function ignoreRaceLoser(): void {}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timed out after ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    promise.catch(ignoreRaceLoser);
  }
}

const CdpResponseSchema = z.object({
  url: z.string(),
  status: z.number(),
  statusText: z.string(),
  headers: z.record(z.string(), z.string()),
});

type CdpResponse = z.infer<typeof CdpResponseSchema>;

const ResponseReceivedSchema = z.object({
  requestId: z.string(),
  response: CdpResponseSchema,
});

const RequestWillBeSentSchema = z.object({
  redirectResponse: CdpResponseSchema.optional(),
});

const RequestIdSchema = z.object({ requestId: z.string() });

const FetchRequestPausedSchema = z.object({
  requestId: z.string(),
  request: z.object({ url: z.string() }),
  responseStatusCode: z.number().optional(),
  responseStatusText: z.string().optional(),
  responseHeaders: z
    .array(z.object({ name: z.string(), value: z.string() }))
    .optional(),
});

type FetchRequestPaused = z.infer<typeof FetchRequestPausedSchema>;

const CdpBodySchema = z.object({
  body: z.string(),
  base64Encoded: z.boolean(),
});

function isArchivableUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

/**
 * CDP returns decoded bodies, so encoding/length headers would lie after re-serialization.
 */
const DROPPED_HEADERS = new Set([
  "content-encoding",
  "transfer-encoding",
  "content-length",
]);

function toHttpHeaders(
  raw: Record<string, string>,
  bodyLength: number,
): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (const [name, value] of Object.entries(raw)) {
    if (DROPPED_HEADERS.has(name.toLowerCase())) {
      continue;
    }
    /** CDP folds duplicate headers into one \n-joined value. */
    for (const part of value.split("\n")) {
      entries.push([name, part]);
    }
  }
  entries.push(["Content-Length", String(bodyLength)]);
  return entries;
}

export class WarcRecorder {
  private readonly wc: WebContents;
  private readonly stream: WriteStream;
  private readonly responses = new Map<string, CdpResponse>();
  private readonly writtenUrls = new Set<string>();
  private readonly partialUrls = new Set<string>();
  private readonly pending = new Set<Promise<void>>();
  private writeChain: Promise<void> = Promise.resolve();
  private totalBytes = 0;
  private reservedBytes = 0;
  private attached = false;
  private lastNetworkActivity = Date.now();

  private constructor(wc: WebContents, filePath: string) {
    this.wc = wc;
    this.stream = createWriteStream(filePath);
  }

  static async start(wc: WebContents, filePath: string): Promise<WarcRecorder> {
    const recorder = new WarcRecorder(wc, filePath);
    const dbg = wc.debugger;
    if (!dbg.isAttached()) {
      dbg.attach("1.3");
    }
    recorder.attached = true;
    dbg.on("message", recorder.onMessage);
    try {
      await withTimeout(
        dbg.sendCommand("Network.enable", {
          maxTotalBufferSize: 200_000_000,
          maxResourceBufferSize: 60_000_000,
        }),
        CDP_TIMEOUT_MS,
      );
      /** Cached responses have no retrievable body over CDP; forcing network keeps the capture complete. */
      await withTimeout(
        dbg.sendCommand("Network.setCacheDisabled", { cacheDisabled: true }),
        CDP_TIMEOUT_MS,
      );
      /**
       * Network.getResponseBody loses bodies for the document and parse-time subresources across the navigation process swap; pausing those responses captures them where they're guaranteed available.
       * Only these four types lose bodies retrievably; Electron rejects Manifest/Prefetch as filter types, and wider interception overloads the debugger bridge (segfaults observed).
       */
      const interceptedTypes = ["Document", "Stylesheet", "Script", "Font"];
      await withTimeout(
        dbg.sendCommand("Fetch.enable", {
          patterns: interceptedTypes.map((resourceType) => ({
            requestStage: "Response",
            resourceType,
          })),
        }),
        CDP_TIMEOUT_MS,
      );
    } catch (error) {
      dbg.off("message", recorder.onMessage);
      try {
        dbg.detach();
      } catch {
        /** The debugger may already be detached; the original error is what gets thrown. */
      }
      recorder.attached = false;
      recorder.stream.destroy();
      throw error;
    }
    return recorder;
  }

  private onMessage = (
    _event: Electron.Event,
    method: string,
    params: JsonValue,
  ): void => {
    try {
      if (method.startsWith("Network.")) {
        this.lastNetworkActivity = Date.now();
      }
      if (method === "Network.responseReceived") {
        const p = ResponseReceivedSchema.parse(params);
        if (!isArchivableUrl(p.response.url)) {
          return;
        }
        /** A range response holds one slice of the file; replaying that slice alone leaves media undecodable. */
        if (p.response.status === 206) {
          this.partialUrls.add(p.response.url);
          return;
        }
        this.responses.set(p.requestId, p.response);
        return;
      }
      if (method === "Network.requestWillBeSent") {
        const p = RequestWillBeSentSchema.parse(params);
        if (p.redirectResponse && isArchivableUrl(p.redirectResponse.url)) {
          this.enqueueWrite(p.redirectResponse, new Uint8Array(0));
        }
        return;
      }
      if (method === "Network.loadingFinished") {
        const p = RequestIdSchema.parse(params);
        const meta = this.responses.get(p.requestId);
        if (!meta) {
          return;
        }
        this.responses.delete(p.requestId);
        const task = this.captureBody(p.requestId, meta).catch(
          (cause: unknown) => {
            log.debug("[pond warc] body capture failed", meta.url, cause);
          },
        );
        this.pending.add(task);
        void task.finally(() => this.pending.delete(task));
        return;
      }
      if (method === "Network.loadingFailed") {
        const p = RequestIdSchema.parse(params);
        this.responses.delete(p.requestId);
        return;
      }
      if (method === "Fetch.requestPaused") {
        const p = FetchRequestPausedSchema.parse(params);
        const task = this.capturePausedResponse(p).catch((cause: unknown) => {
          log.debug("[pond warc] paused capture failed", p.request.url, cause);
        });
        this.pending.add(task);
        void task.finally(() => this.pending.delete(task));
      }
    } catch (error) {
      log.debug("[pond warc] event handling failed", method, error);
    }
  };

  /** Writes the paused response, then always resumes it; a request left paused would hang the page. */
  private async capturePausedResponse(p: FetchRequestPaused): Promise<void> {
    try {
      const status = p.responseStatusCode;
      if (
        status !== undefined &&
        (status < 300 || status >= 400) &&
        isArchivableUrl(p.request.url) &&
        !this.writtenUrls.has(p.request.url)
      ) {
        const res = CdpBodySchema.parse(
          await withTimeout(
            this.wc.debugger.sendCommand("Fetch.getResponseBody", {
              requestId: p.requestId,
            }),
            CDP_TIMEOUT_MS,
          ),
        );
        const body = res.base64Encoded
          ? new Uint8Array(Buffer.from(res.body, "base64"))
          : new Uint8Array(Buffer.from(res.body, "utf8"));
        const headers: Record<string, string> = {};
        for (const h of p.responseHeaders ?? []) {
          headers[h.name] = headers[h.name]
            ? `${headers[h.name]}\n${h.value}`
            : h.value;
        }
        const meta = {
          url: p.request.url,
          status,
          statusText: p.responseStatusText ?? "",
          headers,
        };
        const lost = body.byteLength === 0 && this.expectsBody(meta);
        if (!lost && body.byteLength <= MAX_BODY_BYTES) {
          this.enqueueWrite(meta, body);
        }
      }
    } finally {
      try {
        await withTimeout(
          this.wc.debugger.sendCommand("Fetch.continueRequest", {
            requestId: p.requestId,
          }),
          CDP_TIMEOUT_MS,
        );
      } catch {
        /** A request whose page already closed has nothing left to resume. */
      }
    }
  }

  private async captureBody(
    requestId: string,
    meta: CdpResponse,
  ): Promise<void> {
    if (this.writtenUrls.has(meta.url)) {
      return;
    }
    let body = new Uint8Array(0);
    let bodyRetrieved = false;
    try {
      const res = CdpBodySchema.parse(
        await withTimeout(
          this.wc.debugger.sendCommand("Network.getResponseBody", {
            requestId,
          }),
          CDP_TIMEOUT_MS,
        ),
      );
      body = res.base64Encoded
        ? new Uint8Array(Buffer.from(res.body, "base64"))
        : new Uint8Array(Buffer.from(res.body, "utf8"));
      bodyRetrieved = true;
    } catch {
      /** Evicted bodies stay unretrieved; `expectsBody` decides whether to record the empty response. */
    }
    if ((!bodyRetrieved || body.byteLength === 0) && this.expectsBody(meta)) {
      return;
    }
    if (body.byteLength > MAX_BODY_BYTES) {
      return;
    }
    this.enqueueWrite(meta, body);
  }

  private expectsBody(meta: CdpResponse): boolean {
    if (meta.status === 204 || meta.status === 205 || meta.status === 304) {
      return false;
    }
    for (const [name, value] of Object.entries(meta.headers)) {
      if (name.toLowerCase() === "content-length" && value.trim() === "0") {
        return false;
      }
    }
    return true;
  }

  private enqueueWrite(meta: CdpResponse, body: Uint8Array): void {
    if (this.writtenUrls.has(meta.url)) {
      return;
    }
    if (body.byteLength > this.remainingCaptureBudget()) {
      return;
    }
    this.writtenUrls.add(meta.url);
    this.reservedBytes += body.byteLength;
    const task = this.writeChain.then(async () => {
      try {
        const record = WARCRecord.create(
          {
            url: meta.url,
            date: new Date().toISOString(),
            type: "response",
            warcVersion: "WARC/1.1",
            statusline: `HTTP/1.1 ${meta.status} ${meta.statusText || "OK"}`,
            httpHeaders: toHttpHeaders(meta.headers, body.byteLength),
          },
          [body],
        );
        const bytes = await WARCSerializer.serialize(record, { gzip: true });
        if (bytes.byteLength > MAX_TOTAL_BYTES - this.totalBytes) {
          return;
        }
        this.totalBytes += bytes.byteLength;
        if (!this.stream.write(bytes)) {
          await once(this.stream, "drain");
        }
      } finally {
        this.reservedBytes -= body.byteLength;
      }
    });
    const written = task.catch((cause: unknown) => {
      log.warn("[pond warc] record write failed", meta.url, cause);
    });
    this.writeChain = written;
    this.pending.add(task);
    void written.finally(() => this.pending.delete(task));
  }

  /** Refetches range-loaded and DOM-referenced media through the page's session so each URL is stored whole. */
  async captureFullBodies(
    extraUrls: ReadonlyArray<string> = [],
  ): Promise<void> {
    const queue = [...new Set([...this.partialUrls, ...extraUrls])].filter(
      (url) => isArchivableUrl(url) && !this.writtenUrls.has(url),
    );
    this.partialUrls.clear();
    const worker = async (): Promise<void> => {
      for (let url = queue.shift(); url; url = queue.shift()) {
        await this.captureFullBody(url).catch((cause: unknown) => {
          log.debug("[pond warc] full body capture failed", url, cause);
        });
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(FULL_BODY_CONCURRENCY, queue.length) },
        worker,
      ),
    );
  }

  private async captureFullBody(url: string): Promise<void> {
    if (this.writtenUrls.has(url) || this.remainingCaptureBudget() === 0) {
      return;
    }
    const res = await this.wc.session.fetch(url, {
      signal: AbortSignal.timeout(FULL_BODY_TIMEOUT_MS),
    });
    if (res.status !== 200) {
      await res.body?.cancel();
      return;
    }
    const body = await readResponseBodyWithinBudget(
      res,
      this.remainingCaptureBudget(),
    );
    if (!body) {
      return;
    }
    const headers: Record<string, string> = {};
    res.headers.forEach((value, name) => {
      headers[name] = headers[name] ? `${headers[name]}\n${value}` : value;
    });
    this.enqueueWrite({ url, status: 200, statusText: "OK", headers }, body);
  }

  private remainingCaptureBudget(): number {
    return Math.max(0, MAX_TOTAL_BYTES - this.totalBytes - this.reservedBytes);
  }

  async waitForNetworkIdle(quietMs: number, budgetMs: number): Promise<void> {
    const deadline = Date.now() + budgetMs;
    while (Date.now() < deadline) {
      const quietFor = Date.now() - this.lastNetworkActivity;
      if (quietFor >= quietMs && this.responses.size === 0) {
        return;
      }
      await new Promise((r) => {
        setTimeout(r, Math.min(250, quietMs));
      });
    }
  }

  async flush(budgetMs: number = FLUSH_BUDGET_MS): Promise<void> {
    const deadline = Date.now() + budgetMs;
    while (this.pending.size > 0 && Date.now() < deadline) {
      const remaining = deadline - Date.now();
      await Promise.race([
        Promise.allSettled(this.pending),
        new Promise((r) => {
          setTimeout(r, remaining);
        }),
      ]);
    }
  }

  async stop(): Promise<void> {
    await this.flush();
    const dbg = this.wc.debugger;
    dbg.off("message", this.onMessage);
    if (this.attached) {
      try {
        await withTimeout(
          (async () => {
            await dbg.sendCommand("Fetch.disable");
            await dbg.sendCommand("Network.setCacheDisabled", {
              cacheDisabled: false,
            });
            await dbg.sendCommand("Network.disable");
          })(),
          CDP_TIMEOUT_MS,
        );
      } catch {
        /** The page may be gone already; detaching below still releases the debugger. */
      }
      try {
        dbg.detach();
      } catch {
        /** The debugger detaches itself when its page closes. */
      }
      this.attached = false;
    }
    await new Promise<void>((resolvePromise, reject) => {
      this.stream.end((err?: Error | null) =>
        err ? reject(err) : resolvePromise(),
      );
    });
  }

  get bytesWritten(): number {
    return this.totalBytes;
  }
}
