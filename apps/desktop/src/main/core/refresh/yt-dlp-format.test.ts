import { DEFAULT_VIDEO_DOWNLOAD } from "@pond/schema/db";
import type { DownloadRequest } from "@shared/downloader-contracts";
import { describe, expect, it } from "vitest";
import { cookieAttempts, downloadArgv } from "./yt-dlp-format";

describe("cookieAttempts", () => {
  it("tries YouTube signed out before falling back to cookies", () => {
    expect(cookieAttempts("youtube", 22)).toEqual([false, true]);
  });

  it("sends cookies on the first try for other sources", () => {
    expect(cookieAttempts("twitter", 12)).toEqual([true]);
    expect(cookieAttempts(null, 3)).toEqual([true]);
  });

  it("runs once without cookies when the jar is empty", () => {
    expect(cookieAttempts("youtube", 0)).toEqual([false]);
    expect(cookieAttempts("twitter", 0)).toEqual([false]);
  });
});

describe("downloadArgv", () => {
  const base = {
    source: "youtube" as const,
    prefs: { ...DEFAULT_VIDEO_DOWNLOAD, sponsorblockRemove: true },
    ffmpeg: "/bin/ffmpeg",
    allowPlaylist: false,
  };
  const request: DownloadRequest = {
    mode: "video",
    maxHeight: 720,
    audioFormat: "mp3",
    range: null,
    subtitleLang: null,
    container: null,
    fps: null,
    compression: "original",
    transcriptFormat: "txt",
  };

  function after(argv: string[], flag: string): string | undefined {
    return argv[argv.indexOf(flag) + 1];
  }

  it("caps quality and lifts the size limit for a picked download", () => {
    const argv = downloadArgv({ ...base, request });
    expect(after(argv, "-f")).toContain("[height<=720]");
    expect(argv).not.toContain("--max-filesize");
  });

  it("extracts audio in the picked format", () => {
    const argv = downloadArgv({
      ...base,
      request: { ...request, mode: "audio", audioFormat: "m4a" },
    });
    expect(after(argv, "-f")).toBe("ba/b");
    expect(after(argv, "--audio-format")).toBe("m4a");
    expect(argv).not.toContain("--merge-output-format");
  });

  it("cuts a section at exact frames and skips SponsorBlock", () => {
    const argv = downloadArgv({
      ...base,
      request: { ...request, range: { start: 12, end: 42.5 } },
    });
    expect(after(argv, "--download-sections")).toBe("*12.00-42.50");
    expect(argv).toContain("--force-keyframes-at-cuts");
    expect(argv).not.toContain("--sponsorblock-remove");
  });

  it("ignores the range without ffmpeg", () => {
    const argv = downloadArgv({
      ...base,
      ffmpeg: null,
      request: { ...request, range: { start: 1, end: 5 } },
    });
    expect(argv).not.toContain("--download-sections");
  });

  it("prefers and merges into a picked container", () => {
    const argv = downloadArgv({
      ...base,
      request: { ...request, container: "webm" },
    });
    expect(after(argv, "-S")).toBe("ext:webm:webm");
    expect(after(argv, "--merge-output-format")).toBe("webm");
  });

  it("fetches MP4 to encode a GIF from", () => {
    const argv = downloadArgv({
      ...base,
      request: { ...request, container: "gif", range: { start: 0, end: 10 } },
    });
    expect(after(argv, "--merge-output-format")).toBe("mp4");
  });
});
