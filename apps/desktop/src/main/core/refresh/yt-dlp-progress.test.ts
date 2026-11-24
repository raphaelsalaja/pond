import type { DownloadActivityUpdate } from "@shared/download-activity";
import { describe, expect, it } from "vitest";
import { YTDLP_TRANSFER_FLAGS } from "./yt-dlp-format";
import { runWithTimeout } from "./yt-dlp-process";
import { createYtdlpProgressReporter } from "./yt-dlp-progress";

describe("yt-dlp progress", () => {
  it("parallelizes fragments without swapping the downloader", () => {
    expect(YTDLP_TRANSFER_FLAGS).toEqual(["--concurrent-fragments", "8"]);
  });

  it("decodes machine output and leaves missing metrics unknown", () => {
    const updates: Array<DownloadActivityUpdate> = [];
    const report = createYtdlpProgressReporter((update) =>
      updates.push(update),
    );
    report(
      'POND_PROGRESS:{"status":"downloading","received":1024,"total":"NA","speed":null,"eta":-1,"index":2,"count":3,"url":"secret"}',
    );
    expect(updates).toHaveLength(1);
    expect(updates[0]?.transfer).toMatchObject({
      fileIndex: 2,
      fileCount: 3,
      receivedBytes: 1024,
      totalBytes: undefined,
      bytesPerSecond: undefined,
      etaSeconds: undefined,
    });
    report('POND_PROGRESS:{"status":"finished","received":2048,"total":2048}');
    expect(updates.at(-1)).toMatchObject({
      phase: "processing",
      transfer: { state: "completed", receivedBytes: 2048 },
    });
    expect(JSON.stringify(updates)).not.toContain("secret");
    report("[download] human output");
    report('POND_PROGRESS:{"status":"other"}');
    report("POND_PROGRESS:invalid");
    expect(updates).toHaveLength(2);
  });

  it("reassembles process lines split across chunks on both streams", async () => {
    const lines: Array<string> = [];
    const result = await runWithTimeout(
      process.execPath,
      [
        "-e",
        String.raw`process.stdout.write("one"); setTimeout(() => {process.stdout.write(" two\nlast"); process.stderr.write("error\n");}, 10)`,
      ],
      5000,
      undefined,
      (line) => lines.push(line),
    );
    expect(result.code).toBe(0);
    expect(lines).toContain("one two");
    expect(lines).toContain("last");
    expect(lines).toContain("error");
  });

  it("settles cancellation and kills an active process", async () => {
    const controller = new AbortController();
    const result = await runWithTimeout(
      process.execPath,
      ["-e", 'console.log("ready"); setInterval(() => {}, 1000)'],
      5000,
      controller.signal,
      () => controller.abort(),
    );
    expect(result.code).toBe(125);
  });

  it("keeps a live process alive by resetting the stall timer", async () => {
    const result = await runWithTimeout(
      process.execPath,
      [
        "-e",
        "let n = 0; const id = setInterval(() => { console.log(n++); if (n > 5) clearInterval(id); }, 200)",
      ],
      1000,
      undefined,
      undefined,
      5000,
    );
    expect(result.code).toBe(0);
  });

  it("kills a silent process as stalled before the hard cap", async () => {
    const started = Date.now();
    const result = await runWithTimeout(
      process.execPath,
      ["-e", "setTimeout(() => {}, 5_000)"],
      80,
      undefined,
      undefined,
      5000,
    );
    expect(result.code).toBe(124);
    expect(Date.now() - started).toBeLessThan(1000);
  });
  it("distinguishes audio and video streams of the same playlist file", () => {
    const updates: Array<DownloadActivityUpdate> = [];
    const report = createYtdlpProgressReporter((update) =>
      updates.push(update),
    );
    report(
      'POND_PROGRESS:{"status":"finished","id":"video-id","format":"video","received":100,"index":2,"count":3}',
    );
    report(
      'POND_PROGRESS:{"status":"downloading","id":"video-id","format":"audio","received":10,"index":2,"count":3}',
    );
    expect(updates[0]?.transfer?.transferId).not.toBe(
      updates[1]?.transfer?.transferId,
    );
    expect(updates[0]?.transfer?.fileIndex).toBe(2);
    expect(updates[1]?.transfer?.fileIndex).toBe(2);
    expect(JSON.stringify(updates)).not.toContain("video-id");
  });

  it("drops impossible totals, file counts, and nonfinite metrics", () => {
    const updates: Array<DownloadActivityUpdate> = [];
    const report = createYtdlpProgressReporter((update) =>
      updates.push(update),
    );
    report(
      'POND_PROGRESS:{"status":"downloading","received":100,"total":50,"index":3,"count":2,"speed":1e999,"eta":-1}',
    );
    expect(updates[0]?.transfer).toMatchObject({
      receivedBytes: 100,
      totalBytes: undefined,
      fileIndex: 3,
      fileCount: undefined,
      bytesPerSecond: undefined,
      etaSeconds: undefined,
    });
  });
});
