import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_VIDEO_DOWNLOAD } from "@pond/schema/db";
import type { Source } from "@pond/schema/db";
import { storedAsRawJson } from "@pond/schema/raw-schema";
import type { DownloadRequest } from "@shared/downloader-contracts";
import { describe, expect, it } from "vitest";
import type { persistSave as persistSaveImpl } from "../../persist-save";
import type {
  DownloadedVideoItem,
  downloadVideo as downloadVideoImpl,
} from "../../refresh/yt-dlp";
import type { downloadCaptions as downloadCaptionsImpl } from "../../refresh/yt-dlp-captions";
import { TerminalError, TransientError } from "../extractors/errors";
import { runFetchVideoYtdlp } from "./fetch-video-ytdlp";
import type { VideoDownloadSave } from "./fetch-video-ytdlp";

const videoSave: VideoDownloadSave = {
  source: "youtube",
  url: "https://www.youtube.com/watch?v=yt1",
  accountId: null,
  author: null,
  mediaType: "video",
  files: [],
  rawJson: storedAsRawJson({
    capture: {
      media: [{ type: "video", url: "https://www.youtube.com/watch?v=yt1" }],
    },
  }),
};

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

async function producedFile(name: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "pond-fetch-video-test-"));
  const path = join(dir, name);
  await writeFile(path, "media");
  return path;
}

type VideoDownload = Awaited<ReturnType<typeof downloadVideoImpl>>;
type CaptionsDownload = Awaited<ReturnType<typeof downloadCaptionsImpl>>;

function setup(
  autoDownload: boolean,
  save: VideoDownloadSave = videoSave,
  results: { video?: VideoDownload; captions?: CaptionsDownload } = {},
) {
  const videoDownloads: Array<Parameters<typeof downloadVideoImpl>[0]> = [];
  const captionDownloads: Array<Parameters<typeof downloadCaptionsImpl>[0]> =
    [];
  const persisted: Array<Parameters<typeof persistSaveImpl>> = [];
  const prefsSources: Array<Source | null | undefined> = [];
  const runtime = {
    readSave: async () => save,
    getVideoDownloadPrefs: async (source?: Source | null) => {
      prefsSources.push(source);
      return { ...DEFAULT_VIDEO_DOWNLOAD, autoDownload };
    },
    downloadVideo: async (
      args: Parameters<typeof downloadVideoImpl>[0],
    ): Promise<VideoDownload> => {
      videoDownloads.push(args);
      return results.video ?? null;
    },
    downloadCaptions: async (
      args: Parameters<typeof downloadCaptionsImpl>[0],
    ): Promise<CaptionsDownload> => {
      captionDownloads.push(args);
      return results.captions ?? null;
    },
    isAutoVideoBlockedByStorageGuard: () => false,
    persistSave: async (...args: Parameters<typeof persistSaveImpl>) => {
      persisted.push(args);
      return null;
    },
    transcodeItems: async ({
      items,
    }: {
      items: ReadonlyArray<DownloadedVideoItem>;
    }) => ({
      items: [...items],
      cleanup: async () => {},
    }),
  };
  return {
    runtime,
    videoDownloads,
    captionDownloads,
    persisted,
    prefsSources,
  };
}

function cleanupRecorder() {
  const recorder = {
    calls: 0,
    cleanup: async () => {
      recorder.calls += 1;
    },
  };
  return recorder;
}

describe("fetch_video_ytdlp download gate", () => {
  it("skips yt-dlp when auto-download is off for the source", async () => {
    const { runtime, videoDownloads, prefsSources } = setup(false);

    await expect(
      runFetchVideoYtdlp("yt1", {}, undefined, runtime),
    ).resolves.toBeUndefined();
    expect(videoDownloads).toEqual([]);
    expect(prefsSources).toContain("youtube");
  });

  it("downloads when you request it, even with auto-download off", async () => {
    const { runtime, videoDownloads } = setup(false);

    await expect(
      runFetchVideoYtdlp("yt1", { requested: true }, undefined, runtime),
    ).rejects.toThrow(TransientError);
    expect(videoDownloads).toHaveLength(1);
  });

  it("ignores the gates for a download set up in the Download dialog", async () => {
    const webSave: VideoDownloadSave = {
      ...videoSave,
      source: "web",
      url: "https://vimeo.com/1",
      mediaType: "link",
      rawJson: null,
    };
    const { runtime, videoDownloads } = setup(false, webSave);

    await expect(
      runFetchVideoYtdlp("v1", { download: request() }, undefined, runtime),
    ).rejects.toThrow(TransientError);
    expect(videoDownloads).toContainEqual(
      expect.objectContaining({
        url: "https://vimeo.com/1",
        request: request(),
      }),
    );
  });

  it("downloads automatically when auto-download is on", async () => {
    const { runtime, videoDownloads } = setup(true);

    await expect(
      runFetchVideoYtdlp("yt1", {}, undefined, runtime),
    ).rejects.toThrow(TransientError);
    expect(videoDownloads).toHaveLength(1);
  });
});

describe("fetch_video_ytdlp requested downloads", () => {
  it("recomputes the save size after a video is downloaded onto an existing save", async () => {
    const posterSize = 2560;
    const subtitleSize = 400;
    const saved: VideoDownloadSave = {
      ...videoSave,
      files: [
        {
          kind: "poster",
          path: "poster.jpg",
          sha256: "poster",
          size: posterSize,
        },
        {
          kind: "subtitle",
          path: "captions.vtt",
          sha256: "captions",
          size: subtitleSize,
        },
      ],
    };
    const path = await producedFile("yt1.mp4");
    const video = Buffer.alloc(10_240, 7);
    await writeFile(path, video);
    const posterPath = await producedFile("thumb.gif");
    const poster = Buffer.from(
      "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      "base64",
    );
    await writeFile(posterPath, poster);
    const { runtime, persisted } = setup(false, saved, {
      video: {
        items: [
          {
            path,
            mimeType: "video/mp4",
            size: video.byteLength,
            infoJson: { width: 1280, height: 720 },
            posterPath,
            posterMimeType: "image/gif",
            subtitles: [],
          },
        ],
        cleanup: cleanupRecorder().cleanup,
      },
    });

    await runFetchVideoYtdlp("yt1", { requested: true }, undefined, runtime);

    const [, patch] = persisted[0] ?? [];
    expect(patch?.fileSize).toBe(
      subtitleSize + video.byteLength + poster.byteLength,
    );
  });

  it("stores audio as an audio file and an audio save", async () => {
    const linkSave: VideoDownloadSave = { ...videoSave, mediaType: "link" };
    const path = await producedFile("yt1.mp3");
    const cleanup = cleanupRecorder();
    const { runtime, persisted } = setup(false, linkSave, {
      video: {
        items: [
          {
            path,
            mimeType: "audio/mpeg",
            size: 5,
            infoJson: null,
            posterPath: null,
            posterMimeType: null,
            subtitles: [],
          },
        ],
        cleanup: cleanup.cleanup,
      },
    });

    await runFetchVideoYtdlp(
      "yt1",
      { download: request({ mode: "audio" }) },
      undefined,
      runtime,
    );

    const [, patch, opts] = persisted[0] ?? [];
    expect(patch).toEqual({ mediaType: "audio", fileSize: 5 });
    expect(opts?.replaceFilesWithKind).toEqual(["audio"]);
    expect(opts?.newFiles).toEqual([
      expect.objectContaining({
        kind: "audio",
        filename: "audio.mp3",
        mimeType: "audio/mpeg",
      }),
    ]);
    expect(cleanup.calls).toBeGreaterThan(0);
  });

  it("adds a clip beside a video that is already saved", async () => {
    const saved: VideoDownloadSave = {
      ...videoSave,
      files: [
        { kind: "video", path: "video.mp4", sha256: "a", size: 10 },
        { kind: "poster", path: "poster.jpg", sha256: "b", size: 4 },
      ],
    };
    const path = await producedFile("yt1.mp4");
    const { runtime, persisted } = setup(false, saved, {
      video: {
        items: [
          {
            path,
            mimeType: "video/mp4",
            size: 5,
            infoJson: { width: 1920, height: 1080 },
            posterPath: null,
            posterMimeType: null,
            subtitles: [],
          },
        ],
        cleanup: cleanupRecorder().cleanup,
      },
    });

    await runFetchVideoYtdlp(
      "yt1",
      { download: request({ range: { start: 10.4, end: 19.2 } }) },
      undefined,
      runtime,
    );

    const [, , opts] = persisted[0] ?? [];
    expect(opts?.replaceFilesWithKind).toEqual([]);
    expect(opts?.newFiles).toEqual([
      expect.objectContaining({ kind: "video", filename: "clip-10-20.mp4" }),
    ]);
  });

  it("stores a GIF as an image beside the saved video", async () => {
    const saved: VideoDownloadSave = {
      ...videoSave,
      files: [
        { kind: "video", path: "video.mp4", sha256: "a", size: 10 },
        { kind: "poster", path: "poster.jpg", sha256: "b", size: 4 },
      ],
    };
    const path = await producedFile("yt1.mp4");
    const gif = await producedFile("transcoded.gif");
    await writeFile(
      gif,
      Buffer.from(
        "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        "base64",
      ),
    );
    const { runtime, persisted } = setup(false, saved, {
      video: {
        items: [
          {
            path,
            mimeType: "video/mp4",
            size: 5,
            infoJson: null,
            posterPath: null,
            posterMimeType: null,
            subtitles: [],
          },
        ],
        cleanup: cleanupRecorder().cleanup,
      },
    });
    const convertedCleanup = cleanupRecorder();
    runtime.transcodeItems = async ({ items }) => ({
      items: items.map((item) => ({
        ...item,
        path: gif,
        mimeType: "image/gif",
      })),
      cleanup: convertedCleanup.cleanup,
    });

    await runFetchVideoYtdlp(
      "yt1",
      {
        download: request({ container: "gif", range: { start: 4, end: 9 } }),
      },
      undefined,
      runtime,
    );

    const [, patch, opts] = persisted[0] ?? [];
    expect(patch?.mediaType).toBeUndefined();
    expect(opts?.replaceFilesWithKind).toEqual([]);
    expect(opts?.newFiles).toEqual([
      expect.objectContaining({
        kind: "image",
        filename: "clip-4-9.gif",
        mimeType: "image/gif",
        width: 1,
        height: 1,
      }),
    ]);
    expect(convertedCleanup.calls).toBeGreaterThan(0);
  });

  it("writes a transcript from captions", async () => {
    const { runtime, captionDownloads, persisted } = setup(false, videoSave, {
      captions: {
        subtitle: {
          path: "/tmp/yt1.en.vtt",
          filename: "subtitle.en.vtt",
          mimeType: "text/vtt",
        },
        text: "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello there\n",
        infoJson: null,
        posterPath: null,
        posterMimeType: null,
        cleanup: cleanupRecorder().cleanup,
      },
    });

    await runFetchVideoYtdlp(
      "yt1",
      { download: request({ mode: "transcript", subtitleLang: "en" }) },
      undefined,
      runtime,
    );

    expect(captionDownloads).toContainEqual(
      expect.objectContaining({ lang: "en" }),
    );
    const [, patch, opts] = persisted[0] ?? [];
    const captionText =
      "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello there\n";
    expect(patch).toEqual({
      transcript: "0:01 Hello there",
      transcriptModel: "captions",
      mediaType: "text",
      fileSize:
        Buffer.byteLength("0:01 Hello there\n") +
        Buffer.byteLength(captionText),
    });
    expect(opts?.newFiles?.map((file) => file.filename)).toEqual([
      "transcript.txt",
      "subtitle.en.vtt",
    ]);
  });

  it("stops retrying when a link has no captions", async () => {
    const { runtime } = setup(false);
    await expect(
      runFetchVideoYtdlp(
        "yt1",
        { download: request({ mode: "transcript" }) },
        undefined,
        runtime,
      ),
    ).rejects.toThrow(TerminalError);
  });
});
