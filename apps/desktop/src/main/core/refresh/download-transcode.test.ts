import type { DownloadRequest } from "@shared/downloader-contracts";
import { describe, expect, it } from "vitest";
import { transcodeArgs, transcodeTarget } from "./download-transcode";

function request(patch: Partial<DownloadRequest> = {}): DownloadRequest {
  return {
    mode: "video",
    maxHeight: 720,
    audioFormat: "mp3",
    range: null,
    subtitleLang: null,
    container: null,
    fps: null,
    compression: "original",
    transcriptFormat: "txt",
    ...patch,
  };
}

function after(argv: string[], flag: string): string | undefined {
  return argv[argv.indexOf(flag) + 1];
}

describe("transcodeTarget", () => {
  it("keeps whatever yt-dlp produced when nothing was asked for", () => {
    expect(transcodeTarget(request(), ".mkv")).toBeNull();
  });

  it("skips the encode when the download already matches", () => {
    expect(transcodeTarget(request({ container: "mp4" }), ".mp4")).toBeNull();
  });

  it("converts a mismatched container", () => {
    expect(transcodeTarget(request({ container: "webm" }), ".mp4")).toBe(
      "webm",
    );
  });

  it("re-encodes in place for a frame rate or compression", () => {
    expect(transcodeTarget(request({ fps: 30 }), ".mp4")).toBe("mp4");
    expect(transcodeTarget(request({ compression: "small" }), ".webm")).toBe(
      "webm",
    );
  });

  it("always encodes a GIF and never touches audio", () => {
    expect(transcodeTarget(request({ container: "gif" }), ".mp4")).toBe("gif");
    expect(
      transcodeTarget(request({ mode: "audio", compression: "small" }), ".mp3"),
    ).toBeNull();
  });
});

describe("transcodeArgs", () => {
  it("encodes H.264 at the compression's quality and the picked rate", () => {
    const argv = transcodeArgs(
      request({ fps: 24, compression: "balanced" }),
      "mp4",
      "/in.mkv",
      "/out.mp4",
    );
    expect(after(argv, "-vf")).toBe("fps=24");
    expect(after(argv, "-c:v")).toBe("libx264");
    expect(after(argv, "-crf")).toBe("26");
    expect(argv.at(-1)).toBe("/out.mp4");
  });

  it("encodes VP9 with Opus for WebM", () => {
    const argv = transcodeArgs(
      request({ container: "webm", compression: "small" }),
      "webm",
      "/in.mp4",
      "/out.webm",
    );
    expect(after(argv, "-c:v")).toBe("libvpx-vp9");
    expect(after(argv, "-c:a")).toBe("libopus");
    expect(argv).not.toContain("-vf");
  });

  it("builds a palette GIF capped in height and silent", () => {
    const argv = transcodeArgs(
      request({ container: "gif", maxHeight: 1080, compression: "small" }),
      "gif",
      "/in.mp4",
      "/out.gif",
    );
    const graph = after(argv, "-filter_complex") ?? "";
    expect(graph).toContain("fps=15");
    expect(graph).toContain("min(480,ih)");
    expect(graph).toContain("max_colors=64");
    expect(argv).toContain("-an");
  });
});
