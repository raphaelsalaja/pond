import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { SaveFile } from "@pond/schema/db";
import type { Transaction } from "@pond/schema/tx";
import ffmpegPath from "ffmpeg-static";
import { afterEach, expect, it } from "vitest";
import { saveDirIn } from "../paths";
import { runFfmpeg } from "./convert-media";
import {
  compressExistingVideos,
  encodeTimeout,
  hevcArguments,
  isFaithfulEncode,
  isSafeSource,
  parseDuration,
  parseVideoProbe,
  type VideoCompressionRuntime,
  type VideoProbe,
} from "./video-compression";

const run = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

const videoFile = (path: string, size: number): SaveFile => ({
  kind: "video",
  path,
  sha256: "0".repeat(64),
  size,
  mimeType: "video/mp4",
  width: 1920,
  height: 1080,
});

const posterFile: SaveFile = {
  kind: "poster",
  path: "poster-1.jpg",
  sha256: "1".repeat(64),
  size: 10,
  mimeType: "image/jpeg",
};

interface FakeLibrary {
  runtime: VideoCompressionRuntime;
  commits: Transaction[];
  encodes: string[];
  failures: string[];
}

type FakeSaves = Awaited<ReturnType<VideoCompressionRuntime["load"]>>["saves"];

/** An in-memory library whose encoder writes `outputSize` bytes and reports `encoded` on probe. */
function fakeLibrary(input: {
  saves: FakeSaves;
  source: VideoProbe;
  encoded: VideoProbe;
  outputSize: number;
  /** Source paths whose encode fails. */
  failing?: readonly string[];
  /** The Saves as they read once encoding finishes. */
  current?: FakeSaves;
}): FakeLibrary {
  const written = new Map<string, number>();
  const commits: Transaction[] = [];
  const encodes: string[] = [];
  const failures: string[] = [];
  let workspaces = 0;
  let loads = 0;
  return {
    commits,
    encodes,
    failures,
    runtime: {
      load: async () => {
        loads += 1;
        const later = input.current ?? input.saves;
        return { root: "/library", saves: loads > 1 ? later : input.saves };
      },
      probe: async (path) => (written.has(path) ? input.encoded : input.source),
      encode: async ({ source, output }) => {
        encodes.push(source);
        if (input.failing?.includes(source))
          throw new Error("FFmpeg stopped after 600 seconds.");
        written.set(output, input.outputSize);
      },
      workspace: async () => {
        workspaces += 1;
        return { path: `/tmp/work-${workspaces}`, cleanup: async () => {} };
      },
      hash: async () => encodedSha,
      size: async (path) => {
        const size = written.get(path);
        if (size === undefined) throw new Error(`No file at ${path}`);
        return size;
      },
      commit: async (transaction) => {
        commits.push(transaction);
      },
      reportFailure: (id) => {
        failures.push(id);
      },
    },
  };
}

const encodedSha = "e".repeat(64);

const h264: VideoProbe = {
  videoCodec: "h264",
  audioCodec: "aac",
  duration: 12,
  pixelFormat: "yuv420p",
  videoStreams: 1,
  hdr: false,
};
const hevc: VideoProbe = { ...h264, videoCodec: "hevc" };

it("replaces H.264 videos with smaller HEVC copies and updates the Save", async () => {
  const library = fakeLibrary({
    saves: [
      {
        id: "save-1",
        files: [videoFile("video-1.mp4", 1000), posterFile],
        fileSize: 1000,
        videoCodec: "h264",
        bitrate: 800_000,
      },
    ],
    source: h264,
    encoded: hevc,
    outputSize: 400,
  });

  const result = await compressExistingVideos(
    {
      ids: ["save-1"],
      quality: "balanced",
      signal: new AbortController().signal,
    },
    library.runtime,
  );

  expect(result).toEqual({
    changed: 1,
    skipped: 0,
    failed: 0,
    bytesBefore: 1000,
    bytesAfter: 400,
  });
  const [transaction] = library.commits;
  if (transaction?.kind !== "update" || transaction.model !== "save")
    throw new Error("Expected one Save update.");
  expect(transaction.patch).toMatchObject({
    fileSize: 400,
    videoCodec: "hevc",
    bitrate: 320_000,
  });
  expect(transaction.patch.files?.[0]).toMatchObject({
    path: "video-1.mp4",
    size: 400,
    sha256: encodedSha,
    mimeType: "video/mp4",
  });
  expect(transaction.patch.files?.[1]).toEqual(posterFile);
  expect(transaction.files).toBeUndefined();
  expect(transaction.fileMoves).toEqual([
    { sourcePath: join("/tmp/work-1", "0.mp4"), filename: "video-1.mp4" },
  ]);
  expect(transaction.fileRenames).toBeUndefined();
});

it("keeps Save-level fields that describe a different file", async () => {
  const library = fakeLibrary({
    saves: [
      {
        id: "save-1",
        files: [videoFile("video-1.mp4", 1000)],
        fileSize: 150,
        videoCodec: null,
        bitrate: null,
      },
    ],
    source: h264,
    encoded: hevc,
    outputSize: 400,
  });

  await compressExistingVideos(
    {
      ids: ["save-1"],
      quality: "balanced",
      signal: new AbortController().signal,
    },
    library.runtime,
  );

  const [transaction] = library.commits;
  if (transaction?.kind !== "update" || transaction.model !== "save")
    throw new Error("Expected one Save update.");
  expect(transaction.patch).not.toHaveProperty("fileSize");
  expect(transaction.patch).not.toHaveProperty("videoCodec");
  expect(transaction.patch.files?.[0]).toMatchObject({ size: 400 });
});

it("renames MOV sources to MP4 after re-encoding them", async () => {
  const library = fakeLibrary({
    saves: [
      {
        id: "save-1",
        files: [videoFile("clip.mov", 1000)],
        fileSize: 1000,
        videoCodec: "h264",
        bitrate: null,
      },
    ],
    source: h264,
    encoded: hevc,
    outputSize: 300,
  });

  await compressExistingVideos(
    { ids: ["save-1"], quality: "small", signal: new AbortController().signal },
    library.runtime,
  );

  const [transaction] = library.commits;
  if (transaction?.kind !== "update" || transaction.model !== "save")
    throw new Error("Expected one Save update.");
  expect(transaction.fileRenames).toEqual([
    { from: "clip.mov", to: "clip.mp4" },
  ]);
  expect(transaction.fileMoves?.map((file) => file.filename)).toEqual([
    "clip.mp4",
  ]);
  expect(transaction.patch.bitrate).toBeNull();
});

it("leaves unsafe sources, missing Saves, and small gains untouched", async () => {
  const alreadyHevc = fakeLibrary({
    saves: [
      {
        id: "save-1",
        files: [videoFile("video-1.mp4", 1000)],
        fileSize: 1000,
        videoCodec: "hevc",
        bitrate: null,
      },
    ],
    source: hevc,
    encoded: hevc,
    outputSize: 100,
  });
  const notSmaller = fakeLibrary({
    saves: [
      {
        id: "save-2",
        files: [videoFile("video-1.mp4", 1000)],
        fileSize: 1000,
        videoCodec: "h264",
        bitrate: null,
      },
    ],
    source: h264,
    encoded: hevc,
    outputSize: 950,
  });
  const signal = new AbortController().signal;

  const skippedCodec = await compressExistingVideos(
    { ids: ["save-1", "missing"], quality: "balanced", signal },
    alreadyHevc.runtime,
  );
  const skippedGain = await compressExistingVideos(
    { ids: ["save-2"], quality: "balanced", signal },
    notSmaller.runtime,
  );

  expect(skippedCodec).toMatchObject({ changed: 0, skipped: 2 });
  expect(alreadyHevc.encodes).toEqual([]);
  expect(skippedGain).toMatchObject({ changed: 0, skipped: 1 });
  expect(alreadyHevc.commits).toEqual([]);
  expect(notSmaller.commits).toEqual([]);
});

it("refuses to replace a video when the encode lost length or audio", async () => {
  const truncated = fakeLibrary({
    saves: [
      {
        id: "save-1",
        files: [videoFile("video-1.mp4", 1000)],
        fileSize: 1000,
        videoCodec: "h264",
        bitrate: null,
      },
    ],
    source: h264,
    encoded: { ...hevc, duration: 6 },
    outputSize: 300,
  });

  const result = await compressExistingVideos(
    {
      ids: ["save-1"],
      quality: "balanced",
      signal: new AbortController().signal,
    },
    truncated.runtime,
  );
  expect(result).toMatchObject({ changed: 0, failed: 1 });
  expect(truncated.failures).toEqual(["save-1"]);
  expect(truncated.commits).toEqual([]);
  expect(isFaithfulEncode(h264, { ...hevc, audioCodec: null })).toBe(false);
  expect(isFaithfulEncode(h264, { ...hevc, duration: 12.3 })).toBe(true);
  expect(isFaithfulEncode(h264, h264)).toBe(false);
  expect(isFaithfulEncode(h264, { ...hevc, duration: null })).toBe(false);
});

it("skips sources without a readable duration instead of encoding them", async () => {
  const library = fakeLibrary({
    saves: [
      {
        id: "save-1",
        files: [videoFile("video-1.mp4", 1000)],
        fileSize: 1000,
        videoCodec: "h264",
        bitrate: null,
      },
    ],
    source: { ...h264, duration: null },
    encoded: hevc,
    outputSize: 300,
  });

  const result = await compressExistingVideos(
    {
      ids: ["save-1"],
      quality: "balanced",
      signal: new AbortController().signal,
    },
    library.runtime,
  );

  expect(result).toMatchObject({ changed: 0, skipped: 1, failed: 0 });
  expect(library.encodes).toEqual([]);
  expect(library.commits).toEqual([]);
});

it("only re-encodes single-stream 8-bit SDR sources it knows", () => {
  expect(isSafeSource(h264)).toBe(true);
  expect(isSafeSource({ ...h264, videoCodec: "vp9" })).toBe(true);
  expect(isSafeSource({ ...h264, videoCodec: "prores" })).toBe(false);
  expect(isSafeSource({ ...h264, videoCodec: null })).toBe(false);
  expect(isSafeSource(hevc)).toBe(false);
  expect(isSafeSource({ ...h264, pixelFormat: "yuv420p10le" })).toBe(false);
  expect(isSafeSource({ ...h264, pixelFormat: "yuva420p" })).toBe(false);
  expect(isSafeSource({ ...h264, videoStreams: 2 })).toBe(false);
  expect(isSafeSource({ ...h264, hdr: true })).toBe(false);
  expect(isSafeSource({ ...h264, duration: 0 })).toBe(false);
});

it("reads codec, pixel format, streams, and HDR from FFmpeg probe output", () => {
  const sdr = [
    "  Duration: 00:00:12.00, start: 0.000000, bitrate: 800 kb/s",
    "  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), " +
      "yuv420p(tv, bt709, progressive), 1920x1080, 30 fps",
    "  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz",
  ].join("\n");
  const hdr = [
    "  Duration: 00:00:12.00, start: 0.000000, bitrate: 900 kb/s",
    "  Stream #0:0[0x1](und): Video: hevc (Main 10) (hvc1 / 0x31637668), " +
      "yuv420p10le(tv, bt2020nc/bt2020/smpte2084), 3840x2160, 60 fps",
  ].join("\n");
  const cover = "  Stream #0:2: Video: mjpeg, yuvj420p(pc), 320x240";
  const dolbyVision = "    DOVI configuration record";

  expect(parseVideoProbe(sdr)).toEqual({
    videoCodec: "h264",
    audioCodec: "aac",
    duration: 12,
    pixelFormat: "yuv420p",
    videoStreams: 1,
    hdr: false,
  });
  expect(parseVideoProbe(hdr)).toMatchObject({
    videoCodec: "hevc",
    audioCodec: null,
    pixelFormat: "yuv420p10le",
    hdr: true,
  });
  expect(parseVideoProbe(`${sdr}\n${cover}`).videoStreams).toBe(2);
  expect(parseVideoProbe(`${sdr}\n${dolbyVision}`).hdr).toBe(true);
});

it("commits against the Save as it reads once encoding finishes", async () => {
  const retitledPoster = { ...posterFile, sha256: "2".repeat(64) };
  const library = fakeLibrary({
    saves: [
      {
        id: "save-1",
        files: [videoFile("video-1.mp4", 1000), posterFile],
        fileSize: 1000,
        videoCodec: "h264",
        bitrate: null,
      },
    ],
    current: [
      {
        id: "save-1",
        files: [videoFile("video-1.mp4", 1000), retitledPoster],
        fileSize: 1000,
        videoCodec: "h264",
        bitrate: null,
      },
    ],
    source: h264,
    encoded: hevc,
    outputSize: 400,
  });

  await compressExistingVideos(
    {
      ids: ["save-1"],
      quality: "balanced",
      signal: new AbortController().signal,
    },
    library.runtime,
  );

  const [transaction] = library.commits;
  if (transaction?.kind !== "update" || transaction.model !== "save")
    throw new Error("Expected one Save update.");
  expect(transaction.before.files?.[1]).toEqual(retitledPoster);
  expect(transaction.patch.files?.[0]).toMatchObject({ sha256: encodedSha });
  expect(transaction.patch.files?.[1]).toEqual(retitledPoster);
});

it("leaves a video alone when it changed while it was encoding", async () => {
  const replaced = { ...videoFile("video-1.mp4", 1000), sha256: "9" };
  const library = fakeLibrary({
    saves: [
      {
        id: "save-1",
        files: [videoFile("video-1.mp4", 1000)],
        fileSize: 1000,
        videoCodec: "h264",
        bitrate: null,
      },
    ],
    current: [
      {
        id: "save-1",
        files: [replaced],
        fileSize: 1000,
        videoCodec: "h264",
        bitrate: null,
      },
    ],
    source: h264,
    encoded: hevc,
    outputSize: 400,
  });

  const result = await compressExistingVideos(
    {
      ids: ["save-1"],
      quality: "balanced",
      signal: new AbortController().signal,
    },
    library.runtime,
  );

  expect(result).toMatchObject({ changed: 0, skipped: 1, failed: 0 });
  expect(library.commits).toEqual([]);
});

it("keeps compressing the rest of a batch after one video fails", async () => {
  const library = fakeLibrary({
    saves: ["save-1", "save-2", "save-3"].map((id) => ({
      id,
      files: [videoFile("video-1.mp4", 1000)],
      fileSize: 1000,
      videoCodec: "h264",
      bitrate: null,
    })),
    source: h264,
    encoded: hevc,
    outputSize: 500,
    failing: [join(saveDirIn("/library", "save-2"), "video-1.mp4")],
  });

  const result = await compressExistingVideos(
    {
      ids: ["save-1", "save-2", "save-3"],
      quality: "balanced",
      signal: new AbortController().signal,
    },
    library.runtime,
  );

  expect(result).toMatchObject({ changed: 2, skipped: 0, failed: 1 });
  expect(library.failures).toEqual(["save-2"]);
  expect(library.commits.map((transaction) => transaction.id)).toEqual([
    "save-1",
    "save-3",
  ]);
});

it("stops the batch when it is cancelled mid-encode", async () => {
  const controller = new AbortController();
  const library = fakeLibrary({
    saves: ["save-1", "save-2"].map((id) => ({
      id,
      files: [videoFile("video-1.mp4", 1000)],
      fileSize: 1000,
      videoCodec: "h264",
      bitrate: null,
    })),
    source: h264,
    encoded: hevc,
    outputSize: 500,
  });
  const encode = library.runtime.encode;
  library.runtime.encode = async (input) => {
    controller.abort();
    await encode(input);
    throw new Error("FFmpeg was stopped.");
  };

  await expect(
    compressExistingVideos(
      {
        ids: ["save-1", "save-2"],
        quality: "balanced",
        signal: controller.signal,
      },
      library.runtime,
    ),
  ).rejects.toThrow();
  expect(library.commits).toEqual([]);
  expect(library.encodes).toHaveLength(1);
  expect(library.failures).toEqual([]);
});

it("gives slow x265 encodes far more time than real time", () => {
  expect(encodeTimeout(5)).toBe(10 * 60_000);
  expect(encodeTimeout(43)).toBeGreaterThan(142_000 * 4);
  expect(encodeTimeout(10 * 60 * 60)).toBe(6 * 60 * 60_000);
});

it("copies MP4-compatible audio and re-encodes the rest", () => {
  const copy = hevcArguments({
    source: "in.mp4",
    output: "out.mp4",
    crf: 26,
    copyAudio: true,
  });
  const convert = hevcArguments({
    source: "in.mov",
    output: "out.mp4",
    crf: 26,
    copyAudio: false,
  });
  expect(copy).toEqual(expect.arrayContaining(["libx265", "hvc1", "copy"]));
  expect(convert).toEqual(expect.arrayContaining(["aac", "160k"]));
  expect(copy.at(-1)).toBe("out.mp4");
});

it("reads durations from FFmpeg probe output", () => {
  expect(parseDuration("  Duration: 00:01:02.50, start: 0.000000")).toBe(62.5);
  expect(parseDuration("no duration here")).toBeNull();
});

it.skipIf(!ffmpegPath)(
  "re-encodes a real H.264 file into a smaller, playable HEVC file",
  async () => {
    const ffmpeg = ffmpegPath;
    if (!ffmpeg) throw new Error("FFmpeg unavailable");
    const root = await mkdtemp(join(tmpdir(), "pond-video-compression-"));
    roots.push(root);
    const saveDirectory = saveDirIn(root, "save-1");
    await mkdir(saveDirectory, { recursive: true });
    const source = join(saveDirectory, "video-1.mp4");
    await run(ffmpeg, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=640x360:rate=30:duration=2",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=2",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "10",
      "-c:a",
      "aac",
      "-shortest",
      source,
    ]);
    const probe = async (path: string): Promise<VideoProbe> => {
      const output = await run(ffmpeg, ["-hide_banner", "-i", path]).then(
        () => "",
        (error: { stderr?: string }) => error.stderr ?? "",
      );
      return parseVideoProbe(output);
    };
    const commits: Transaction[] = [];
    const encodedPath = join(root, "encoded.mp4");
    const before = (await stat(source)).size;

    const result = await compressExistingVideos(
      {
        ids: ["save-1"],
        quality: "balanced",
        signal: new AbortController().signal,
      },
      {
        load: async () => ({
          root,
          saves: [
            {
              id: "save-1",
              files: [videoFile("video-1.mp4", before)],
              fileSize: before,
              videoCodec: "h264",
              bitrate: null,
            },
          ],
        }),
        probe,
        encode: ({ args, duration, signal }) =>
          runFfmpeg({ path: ffmpeg, args, duration, signal }),
        workspace: async () => {
          const path = await mkdtemp(join(root, "work-"));
          return {
            path,
            cleanup: () => rm(path, { recursive: true, force: true }),
          };
        },
        hash: async (path) => {
          const bytes = await readFile(path);
          return createHash("sha256").update(bytes).digest("hex");
        },
        size: async (path) => (await stat(path)).size,
        commit: async (transaction) => {
          commits.push(transaction);
          if (transaction.kind !== "update" || transaction.model !== "save")
            return;
          const moved = transaction.fileMoves?.[0];
          if (moved) await copyFile(moved.sourcePath, encodedPath);
        },
        reportFailure: (_id, reason) => {
          throw new Error(reason);
        },
      },
    );

    expect(result.changed).toBe(1);
    expect(result.bytesAfter).toBeLessThan(before * 0.9);
    const [transaction] = commits;
    if (transaction?.kind !== "update" || transaction.model !== "save")
      throw new Error("Expected one Save update.");
    expect(transaction.fileMoves?.map((file) => file.filename)).toEqual([
      "video-1.mp4",
    ]);
    expect(await probe(encodedPath)).toMatchObject({
      videoCodec: "hevc",
      audioCodec: "aac",
    });
  },
  60_000,
);
