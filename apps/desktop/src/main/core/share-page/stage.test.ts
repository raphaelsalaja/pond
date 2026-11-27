import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import type { MediaJob, StagedMedia } from "./plan";
import { saveFilePath, stageMedia } from "./stage";

const run = promisify(execFile);

let root: string;
let page: string;
let saveDirectory: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "pond-share-page-"));
  page = join(root, "page");
  saveDirectory = join(root, "library", "items", "SAVE.info");
  await mkdir(saveDirectory, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function job(overrides: Partial<MediaJob>): MediaJob {
  return {
    saveId: "SAVE",
    file: "photo.jpg",
    to: "media/s1-0.webp",
    role: "image",
    orient: { rotate: 0, flipX: false, flipY: false },
    ...overrides,
  };
}

function stage(jobs: Array<MediaJob>, ffmpeg: string | null = null) {
  return stageMedia({
    jobs,
    directory: page,
    source: (entry) => saveFilePath(join(root, "library"), entry),
    ffmpeg,
  });
}

async function photoWithLocation(width: number, height: number) {
  await sharp({
    create: { width, height, channels: 3, background: "#3a6" },
  })
    .withExif({
      IFD0: { Make: "TestCam", Model: "Secret Model" },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "51/1 30/1 0/1" },
    })
    .jpeg()
    .toFile(join(saveDirectory, "photo.jpg"));
}

describe("stageMedia", () => {
  it("writes a web copy without the photo's camera or location", async () => {
    await photoWithLocation(3000, 2000);
    const before = await sharp(join(saveDirectory, "photo.jpg")).metadata();
    expect(before.exif).toBeDefined();

    const staged = await stage([job({})]);

    expect(staged.get("media/s1-0.webp")).toEqual({
      width: 2560,
      height: 1707,
    });
    const after = await sharp(join(page, "media/s1-0.webp")).metadata();
    expect(after.format).toBe("webp");
    expect(after.exif).toBeUndefined();
    expect(after.xmp).toBeUndefined();
    expect(after.icc).toBeUndefined();
  });

  it("makes cards narrow and applies the Save's rotation", async () => {
    await photoWithLocation(2000, 1000);
    const staged = await stage([
      job({ role: "thumbnail", to: "media/s1-thumb.webp" }),
      job({
        to: "media/s1-0.webp",
        orient: { rotate: 90, flipX: false, flipY: false },
      }),
    ]);
    expect(staged.get("media/s1-thumb.webp")).toEqual({
      width: 720,
      height: 360,
    });
    expect(staged.get("media/s1-0.webp")).toEqual({
      width: 1000,
      height: 2000,
    });
  });

  it("leaves out a file it can't read instead of failing the page", async () => {
    const staged = await stage([job({ file: "missing.jpg" })]);
    expect(staged.size).toBe(0);
  });

  it("never reads outside the Save's folder", () => {
    const library = join(root, "library");
    expect(
      saveFilePath(library, job({ file: "../OTHER.info/photo.jpg" })),
    ).toBeNull();
    expect(saveFilePath(library, job({ file: "/etc/hosts" }))).toBeNull();
    expect(saveFilePath(library, job({ file: "photo.jpg" }))).toBe(
      join(saveDirectory, "photo.jpg"),
    );
  });

  it("leaves videos out when ffmpeg is missing rather than copying their metadata", async () => {
    const staged = await stage([
      job({ role: "video", file: "clip.mp4", to: "media/s1-0.mp4" }),
    ]);
    expect(staged.size).toBe(0);
  });
});

describe.skipIf(!ffmpegPath)("stageMedia video", () => {
  const ffmpeg = ffmpegPath ?? "";
  let videoRoot: string;
  let staged: StagedMedia;
  let metadata: string;

  /** ffmpeg makes a clip tagged with a title and a location, then Pond stages it and ffmpeg reads back what's left. */
  beforeAll(async () => {
    videoRoot = await mkdtemp(join(tmpdir(), "pond-share-page-video-"));
    const directory = join(videoRoot, "library", "items", "SAVE.info");
    await mkdir(directory, { recursive: true });
    await run(ffmpeg, [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=64x48:rate=10:duration=1",
      "-metadata",
      "title=Secret Title",
      "-metadata",
      "location=+51.5000-000.1000/",
      "-c:v",
      "mpeg4",
      join(directory, "clip.mp4"),
    ]);
    const page = join(videoRoot, "page");
    staged = await stageMedia({
      jobs: [
        job({
          role: "video",
          file: "clip.mp4",
          to: "media/s1-0.mp4",
          width: 64,
          height: 48,
        }),
      ],
      directory: page,
      source: (entry) => saveFilePath(join(videoRoot, "library"), entry),
      ffmpeg,
    });
    metadata = (
      await run(ffmpeg, [
        "-v",
        "error",
        "-i",
        join(page, "media/s1-0.mp4"),
        "-f",
        "ffmetadata",
        "-",
      ])
    ).stdout;
  }, 60_000);

  afterAll(async () => {
    await rm(videoRoot, { recursive: true, force: true });
  });

  it("remuxes a video without its title or location", () => {
    expect(staged.get("media/s1-0.mp4")).toEqual({ width: 64, height: 48 });
    expect(metadata).not.toContain("Secret Title");
    expect(metadata).not.toContain("51.5000");
  });
});
