import { mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { DownloadRequest } from "@shared/downloader-contracts";
import { describe, expect, it } from "vitest";
import { createDownloadExports } from "./download-export";
import type { DownloadExportRuntime } from "./download-export";

const URL = "https://www.youtube.com/watch?v=abc123def45";

function request(patch: Partial<DownloadRequest> = {}): DownloadRequest {
  return {
    mode: "video",
    maxHeight: null,
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

async function setup({
  downloadFails = false,
  fetchFails = false,
}: { downloadFails?: boolean; fetchFails?: boolean } = {}) {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "pond-download-export-")),
  );
  const media = join(root, "media.mp4");
  await writeFile(media, "video");
  const downloads = join(root, "Downloads");
  const clipboard = join(root, "clipboard");
  const clipboardTexts: Array<string> = [];
  const clipboardFiles: Array<Array<string>> = [];
  const savedFiles: Array<Parameters<DownloadExportRuntime["saveFiles"]>[0]> =
    [];
  const calls = { cleanups: 0, clipboardTexts, clipboardFiles, savedFiles };
  const runtime: DownloadExportRuntime = {
    downloadVideo: async () =>
      downloadFails
        ? null
        : {
            items: [
              {
                path: media,
                mimeType: "video/mp4",
                size: 5,
                infoJson: { title: "Big Buck Bunny" },
                posterPath: null,
                posterMimeType: null,
                subtitles: [],
              },
            ],
            cleanup: async () => {
              calls.cleanups += 1;
            },
          },
    downloadCaptions: async () => ({
      subtitle: {
        path: "",
        filename: "a.vtt",
        mimeType: "text/vtt",
        lang: "en",
      },
      text: "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello there\n",
      infoJson: { title: "Talk" },
      posterPath: null,
      posterMimeType: null,
      cleanup: async () => {},
    }),
    transcodeItems: async ({ items }) => ({
      items: [...items],
      cleanup: async () => {},
    }),
    defaultFolder: () => downloads,
    clipboardFolder: () => clipboard,
    writeClipboardText: (text) => {
      calls.clipboardTexts.push(text);
    },
    writeClipboardFiles: async (paths) => {
      calls.clipboardFiles.push(paths);
    },
    fetchFile: async (url: string) => {
      if (fetchFails) {
        throw new Error("HTTP 404");
      }
      return {
        bytes: Buffer.from(url),
        filename: `${url.split("/").at(-1)}.jpg`,
        mimeType: "image/jpeg",
      };
    },
    saveFiles: async (input) => {
      calls.savedFiles.push(input);
      return { ok: true };
    },
  };
  return {
    exports: createDownloadExports(runtime),
    calls,
    downloads,
  };
}

describe("download exports", () => {
  it("copies the file into Downloads under the video's title", async () => {
    const { exports, downloads, calls } = await setup();
    const result = await exports.run({
      url: URL,
      request: request(),
      destination: "file",
    });
    expect(result).toEqual({
      ok: true,
      destination: "file",
      path: join(downloads, "Big Buck Bunny.mp4"),
    });
    expect(calls.cleanups).toBeGreaterThan(0);
    expect(exports.owns(join(downloads, "Big Buck Bunny.mp4"))).toBe(true);
    expect(exports.owns("/etc/hosts")).toBe(false);
  });

  it("puts the file on the clipboard", async () => {
    const { exports, calls } = await setup();
    const result = await exports.run({
      url: URL,
      request: request(),
      destination: "clipboard",
    });
    expect(result.ok).toBe(true);
    const path = result.ok ? result.path : null;
    expect(path && basename(path)).toBe("Big Buck Bunny.mp4");
    expect(calls.clipboardFiles).toContainEqual([path]);
  });

  it("writes a transcript file in the picked format", async () => {
    const { exports, downloads } = await setup();
    const result = await exports.run({
      url: URL,
      request: request({ mode: "transcript", transcriptFormat: "srt" }),
      destination: "file",
    });
    const path = join(downloads, "Talk.srt");
    expect(result).toEqual({ ok: true, destination: "file", path });
    expect(await readFile(path, "utf8")).toBe(
      "1\n00:00:01,000 --> 00:00:02,000\nHello there\n",
    );
  });

  it("copies a transcript to the clipboard as text", async () => {
    const { exports, calls } = await setup();
    const result = await exports.run({
      url: URL,
      request: request({ mode: "transcript" }),
      destination: "clipboard",
    });
    expect(result).toEqual({ ok: true, destination: "clipboard", path: null });
    expect(calls.clipboardTexts).toContain("0:01 Hello there");
  });

  it("uses a picked folder", async () => {
    const { exports } = await setup();
    const picked = await realpath(
      await mkdtemp(join(tmpdir(), "pond-picked-")),
    );
    expect(exports.choose(picked).path).toBe(picked);
    const result = await exports.run({
      url: URL,
      request: request(),
      destination: "file",
    });
    expect(result.ok && result.path).toBe(join(picked, "Big Buck Bunny.mp4"));
  });

  it("reports a failed download", async () => {
    const { exports } = await setup({ downloadFails: true });
    const result = await exports.run({
      url: URL,
      request: request(),
      destination: "file",
    });
    expect(result.ok).toBe(false);
  });

  describe("files", () => {
    const POST = "https://x.com/a/status/1";
    const IMAGES = [
      "https://pbs.twimg.com/media/one",
      "https://pbs.twimg.com/media/two",
    ];

    it("writes every file into the export folder", async () => {
      const { exports, downloads } = await setup();
      const result = await exports.files({
        url: POST,
        title: "Post",
        files: IMAGES,
        destination: "file",
      });
      const paths = [join(downloads, "one.jpg"), join(downloads, "two.jpg")];
      expect(result).toEqual({ ok: true, paths });
      expect(await readFile(paths[0] ?? "", "utf8")).toBe(IMAGES[0]);
      expect(exports.owns(paths[1] ?? "")).toBe(true);
    });

    it("puts every file on the clipboard", async () => {
      const { exports, calls } = await setup();
      const result = await exports.files({
        url: POST,
        title: null,
        files: IMAGES,
        destination: "clipboard",
      });
      expect(result.ok && result.paths.map((path) => basename(path))).toEqual([
        "one.jpg",
        "two.jpg",
      ]);
      expect(calls.clipboardFiles).toContainEqual(
        result.ok ? result.paths : [],
      );
    });

    it("saves the files to the library with the page they came from", async () => {
      const { exports, calls } = await setup();
      const result = await exports.files({
        url: POST,
        title: "Post",
        files: IMAGES,
        destination: "library",
      });
      expect(result).toEqual({ ok: true, paths: [] });
      expect(calls.savedFiles).toContainEqual(
        expect.objectContaining({
          url: POST,
          title: "Post",
          sourceUrls: IMAGES,
        }),
      );
    });

    it("reports a failed fetch", async () => {
      const { exports } = await setup({ fetchFails: true });
      const result = await exports.files({
        url: POST,
        title: null,
        files: IMAGES,
        destination: "file",
      });
      expect(result.ok).toBe(false);
    });
  });
});
