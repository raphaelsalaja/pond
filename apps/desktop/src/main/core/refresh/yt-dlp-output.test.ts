import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  keepsPartialDownload,
  pickProducedFiles,
  readCompletedFiles,
} from "./yt-dlp-output";

describe("pickProducedFiles", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
    );
  });

  it("keeps playlist order even when a later clip is larger", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pond-ytdlp-out-"));
    dirs.push(dir);
    await writeFile(join(dir, "quoted.mp4"), Buffer.alloc(200));
    await writeFile(
      join(dir, "quoted.info.json"),
      JSON.stringify({ id: "quoted", playlist_index: 2 }),
    );
    await writeFile(join(dir, "parent.mp4"), Buffer.alloc(50));
    await writeFile(
      join(dir, "parent.info.json"),
      JSON.stringify({ id: "parent", playlist_index: 1 }),
    );

    const files = await pickProducedFiles(dir);
    expect(files.map((f) => f.infoJson?.id)).toEqual(["parent", "quoted"]);
  });

  it("keeps only finished files when a manifest is given", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pond-ytdlp-out-"));
    dirs.push(dir);
    await writeFile(join(dir, "finished.mp4"), Buffer.alloc(50));
    await writeFile(join(dir, "truncated.mp4"), Buffer.alloc(20));
    const root = await mkdtemp(join(tmpdir(), "pond-ytdlp-attempt-"));
    dirs.push(root);
    const manifest = join(root, "completed.txt");
    await writeFile(manifest, `${join(dir, "finished.mp4")}\n`);

    const completed = await readCompletedFiles(manifest);
    const files = await pickProducedFiles(dir, completed);
    expect(files.map((f) => f.path)).toEqual([join(dir, "finished.mp4")]);
  });

  it("returns nothing when yt-dlp never created the folder", async () => {
    expect(await pickProducedFiles(join(tmpdir(), "pond-missing-dir"))).toEqual(
      [],
    );
  });

  it("keeps the merged video when the audio and video streams were also written", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pond-ytdlp-out-"));
    dirs.push(dir);
    await writeFile(join(dir, "abc.f140.m4a"), Buffer.alloc(180));
    await writeFile(join(dir, "abc.f299.mp4"), Buffer.alloc(90));
    await writeFile(join(dir, "abc.mp4"), Buffer.alloc(400));
    await writeFile(join(dir, "abc.jpg"), Buffer.alloc(10));
    await writeFile(
      join(dir, "abc.info.json"),
      JSON.stringify({ id: "abc", playlist_index: 1 }),
    );

    const files = await pickProducedFiles(dir);
    expect(files.map((file) => file.path)).toEqual([join(dir, "abc.mp4")]);
  });

  it("drops an audio file that shares the merged video name", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pond-ytdlp-out-"));
    dirs.push(dir);
    await writeFile(join(dir, "abc.m4a"), Buffer.alloc(180));
    await writeFile(join(dir, "abc.mp4"), Buffer.alloc(400));

    const files = await pickProducedFiles(dir);
    expect(files.map((file) => file.path)).toEqual([join(dir, "abc.mp4")]);
  });

  it("returns nothing when the audio and video streams were never merged", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pond-ytdlp-out-"));
    dirs.push(dir);
    await writeFile(join(dir, "abc.f140.m4a"), Buffer.alloc(180));
    await writeFile(join(dir, "abc.f299.mp4"), Buffer.alloc(90));

    expect(await pickProducedFiles(dir)).toEqual([]);
  });

  it("keeps an audio download that has no video beside it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pond-ytdlp-out-"));
    dirs.push(dir);
    await writeFile(join(dir, "abc.m4a"), Buffer.alloc(80));

    const files = await pickProducedFiles(dir);
    expect(files.map((file) => file.path)).toEqual([join(dir, "abc.m4a")]);
  });
});

describe("readCompletedFiles", () => {
  it("treats a missing manifest as no finished files", async () => {
    const files = await readCompletedFiles(join(tmpdir(), "pond-no-manifest"));
    expect(files.size).toBe(0);
  });
});

describe("keepsPartialDownload", () => {
  it("keeps a post's videos when a trailing link card fails", () => {
    expect(keepsPartialDownload(1, 1, 1)).toBe(true);
    expect(keepsPartialDownload(1, 2, 2)).toBe(true);
  });

  it("retries when fewer videos finished than the save expects", () => {
    expect(keepsPartialDownload(1, 1, 2)).toBe(false);
    expect(keepsPartialDownload(1, 0, 1)).toBe(false);
  });

  it("never keeps files after a timeout or abort", () => {
    expect(keepsPartialDownload(124, 1, 1)).toBe(false);
    expect(keepsPartialDownload(125, 1, 1)).toBe(false);
  });
});
