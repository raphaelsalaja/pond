import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_VIDEO_DOWNLOAD } from "@pond/schema/db";
import { storedAsRawJson } from "@pond/schema/raw-schema";
import type { DownloadRequest } from "@shared/downloader-contracts";
import { describe, expect, it, vi } from "vitest";
import type { DownloadedVideoItem } from "../../refresh/yt-dlp";
import { TerminalError, TransientError } from "../extractors/errors";
import {
  runFetchVideoYtdlp,
  type VideoDownloadSave,
} from "./fetch-video-ytdlp";

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

function setup(autoDownload: boolean, save: VideoDownloadSave = videoSave) {
  const downloadVideo = vi.fn<
    typeof import("../../refresh/yt-dlp").downloadVideo
  >(async () => null);
  const downloadCaptions = vi.fn<
    typeof import("../../refresh/yt-dlp-captions").downloadCaptions
  >(async () => null);
  const persistSave = vi.fn<typeof import("../../persist-save").persistSave>(
    async () => null,
  );
  const getVideoDownloadPrefs = vi.fn(async () => ({
    ...DEFAULT_VIDEO_DOWNLOAD,
    autoDownload,
  }));
  const runtime = {
    readSave: async () => save,
    getVideoDownloadPrefs,
    downloadVideo,
    downloadCaptions,
    isAutoVideoBlockedByStorageGuard: () => false,
    persistSave,
    transcodeItems: async ({
      items,
    }: {
      items: readonly DownloadedVideoItem[];
    }) => ({
      items: [...items],
      cleanup: async () => {},
    }),
  };
  return {
    runtime,
    downloadVideo,
    downloadCaptions,
    persistSave,
    getVideoDownloadPrefs,
  };
}

describe("fetch_video_ytdlp download gate", () => {
  it("skips yt-dlp when auto-download is off for the source", async () => {
    const { runtime, downloadVideo, getVideoDownloadPrefs } = setup(false);

    await expect(
      runFetchVideoYtdlp("yt1", {}, undefined, runtime),
    ).resolves.toBeUndefined();
    expect(downloadVideo).not.toHaveBeenCalled();
    expect(getVideoDownloadPrefs).toHaveBeenCalledWith("youtube");
  });

  it("downloads when you request it, even with auto-download off", async () => {
    const { runtime, downloadVideo } = setup(false);

    await expect(
      runFetchVideoYtdlp("yt1", { requested: true }, undefined, runtime),
    ).rejects.toThrow(TransientError);
    expect(downloadVideo).toHaveBeenCalledOnce();
  });

  it("ignores the gates for a download set up in the Download dialog", async () => {
    const webSave: VideoDownloadSave = {
      ...videoSave,
      source: "web",
      url: "https://vimeo.com/1",
      mediaType: "link",
      rawJson: null,
    };
    const { runtime, downloadVideo } = setup(false, webSave);

    await expect(
      runFetchVideoYtdlp("v1", { download: request() }, undefined, runtime),
    ).rejects.toThrow(TransientError);
    expect(downloadVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://vimeo.com/1",
        request: request(),
      }),
    );
  });

  it("downloads automatically when auto-download is on", async () => {
    const { runtime, downloadVideo } = setup(true);

    await expect(
      runFetchVideoYtdlp("yt1", {}, undefined, runtime),
    ).rejects.toThrow(TransientError);
    expect(downloadVideo).toHaveBeenCalledOnce();
  });
});

describe("fetch_video_ytdlp requested downloads", () => {
  const cleanup = vi.fn(async () => {});

  it("recomputes the save size after a video is downloaded onto an existing save", async () => {
    const posterSize = 2_560;
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
    const { runtime, downloadVideo, persistSave } = setup(false, saved);
    const path = await producedFile("yt1.mp4");
    const video = Buffer.alloc(10_240, 7);
    await writeFile(path, video);
    const posterPath = await producedFile("thumb.gif");
    const poster = Buffer.from(
      "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      "base64",
    );
    await writeFile(posterPath, poster);
    downloadVideo.mockResolvedValue({
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
      cleanup,
    });

    await runFetchVideoYtdlp("yt1", { requested: true }, undefined, runtime);

    const [, patch] = persistSave.mock.calls[0] ?? [];
    expect(patch?.fileSize).toBe(
      subtitleSize + video.byteLength + poster.byteLength,
    );
  });

  it("stores audio as an audio file and an audio save", async () => {
    const linkSave: VideoDownloadSave = { ...videoSave, mediaType: "link" };
    const { runtime, downloadVideo, persistSave } = setup(false, linkSave);
    const path = await producedFile("yt1.mp3");
    downloadVideo.mockResolvedValue({
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
      cleanup,
    });

    await runFetchVideoYtdlp(
      "yt1",
      { download: request({ mode: "audio" }) },
      undefined,
      runtime,
    );

    const [, patch, opts] = persistSave.mock.calls[0] ?? [];
    expect(patch).toEqual({ mediaType: "audio", fileSize: 5 });
    expect(opts?.replaceFilesWithKind).toEqual(["audio"]);
    expect(opts?.newFiles).toEqual([
      expect.objectContaining({
        kind: "audio",
        filename: "audio.mp3",
        mimeType: "audio/mpeg",
      }),
    ]);
    expect(cleanup).toHaveBeenCalled();
  });

  it("adds a clip beside a video that is already saved", async () => {
    const saved: VideoDownloadSave = {
      ...videoSave,
      files: [
        { kind: "video", path: "video.mp4", sha256: "a", size: 10 },
        { kind: "poster", path: "poster.jpg", sha256: "b", size: 4 },
      ],
    };
    const { runtime, downloadVideo, persistSave } = setup(false, saved);
    const path = await producedFile("yt1.mp4");
    downloadVideo.mockResolvedValue({
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
      cleanup,
    });

    await runFetchVideoYtdlp(
      "yt1",
      { download: request({ range: { start: 10.4, end: 19.2 } }) },
      undefined,
      runtime,
    );

    const [, , opts] = persistSave.mock.calls[0] ?? [];
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
    const { runtime, downloadVideo, persistSave } = setup(false, saved);
    const path = await producedFile("yt1.mp4");
    const gif = await producedFile("transcoded.gif");
    await writeFile(
      gif,
      Buffer.from(
        "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        "base64",
      ),
    );
    downloadVideo.mockResolvedValue({
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
      cleanup,
    });
    const convertedCleanup = vi.fn(async () => {});
    runtime.transcodeItems = async ({ items }) => ({
      items: items.map((item) => ({
        ...item,
        path: gif,
        mimeType: "image/gif",
      })),
      cleanup: convertedCleanup,
    });

    await runFetchVideoYtdlp(
      "yt1",
      {
        download: request({ container: "gif", range: { start: 4, end: 9 } }),
      },
      undefined,
      runtime,
    );

    const [, patch, opts] = persistSave.mock.calls[0] ?? [];
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
    expect(convertedCleanup).toHaveBeenCalled();
  });

  it("writes a transcript from captions", async () => {
    const { runtime, downloadCaptions, persistSave } = setup(false);
    downloadCaptions.mockResolvedValue({
      subtitle: {
        path: "/tmp/yt1.en.vtt",
        filename: "subtitle.en.vtt",
        mimeType: "text/vtt",
      },
      text: "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello there\n",
      infoJson: null,
      posterPath: null,
      posterMimeType: null,
      cleanup,
    });

    await runFetchVideoYtdlp(
      "yt1",
      { download: request({ mode: "transcript", subtitleLang: "en" }) },
      undefined,
      runtime,
    );

    expect(downloadCaptions).toHaveBeenCalledWith(
      expect.objectContaining({ lang: "en" }),
    );
    const [, patch, opts] = persistSave.mock.calls[0] ?? [];
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
