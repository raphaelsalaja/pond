import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { afterEach, describe, expect, it } from "vitest";
import { openExportReader } from "./reader";

const dirs: Array<string> = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

async function temp() {
  const dir = await mkdtemp(join(tmpdir(), "pond-export-"));
  dirs.push(dir);
  return dir;
}

describe("openExportReader", () => {
  it("lists and reads files from an unzipped folder with forward-slash paths", async () => {
    const dir = await temp();
    await mkdir(join(dir, "data"));
    await writeFile(join(dir, "data", "like.js"), "x");
    const reader = await openExportReader(dir);
    expect(reader.paths).toEqual(["data/like.js"]);
    expect(await reader.readText("data/like.js")).toBe("x");
    await reader.close();
  });

  it("lists and reads entries from a zip without extracting it", async () => {
    const dir = await temp();
    const zip = new JSZip();
    const playlist =
      "Takeout/YouTube and YouTube Music/playlists/Refs-videos.csv";
    zip.file(playlist, "Video ID\n");
    zip.file("Takeout/huge.mp4", Buffer.alloc(16));
    const path = join(dir, "takeout.zip");
    await writeFile(
      path,
      await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
    );
    const reader = await openExportReader(path);
    expect(reader.paths).toContain(playlist);
    expect(reader.paths).not.toContain("Takeout/");
    expect(await reader.readText(playlist)).toBe("Video ID\n");
    await expect(reader.readText("missing.csv")).rejects.toThrow();
    await reader.close();
  });

  it("rejects a file that is neither a folder nor a zip", async () => {
    const dir = await temp();
    const path = join(dir, "notes.txt");
    await writeFile(path, "hello");
    await expect(openExportReader(path)).rejects.toThrow();
  });
});
