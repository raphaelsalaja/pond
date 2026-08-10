import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Save } from "@/lib/types";
import { buildMediaUnits } from "./units";

const LIBRARY_PATH = process.env.POND_LIBRARY_PATH;
const describeLibrary = LIBRARY_PATH ? describe : describe.skip;

describeLibrary("live library media units", () => {
  it("keeps image covers visible and gives every video a resting poster", async () => {
    if (!LIBRARY_PATH) return;
    const itemsDir = join(LIBRARY_PATH, "items");
    const entries = await readdir(itemsDir, { withFileTypes: true });
    const missingImageCovers: string[] = [];
    const videosWithoutPosters: string[] = [];
    let saveCount = 0;
    let imageCoverCount = 0;
    let videoCount = 0;

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.endsWith(".info")) continue;
      let save: Save;
      try {
        save = JSON.parse(
          await readFile(join(itemsDir, entry.name, "info.json"), "utf8"),
        ) as Save;
      } catch {
        continue;
      }
      saveCount += 1;

      const files = save.files ?? [];
      const covers = files.filter((file) => file.kind === "cover");
      const hasVideo = files.some(
        (file) =>
          file.mimeType?.startsWith("video/") ||
          /\.(?:mp4|mov|m4v|webm)$/i.test(file.path),
      );
      const units = buildMediaUnits(save);

      if (covers.length > 0 && !hasVideo) {
        imageCoverCount += 1;
        const unitKeys = new Set(units.map((unit) => unit.key));
        if (!covers.some((cover) => unitKeys.has(cover.path))) {
          missingImageCovers.push(save.id);
        }
      }

      for (const unit of units) {
        if (!unit.isVideo) continue;
        videoCount += 1;
        if (!unit.posterUrl) videosWithoutPosters.push(save.id);
      }
    }

    console.info(
      JSON.stringify({ saveCount, imageCoverCount, videoCount }, null, 2),
    );
    expect(missingImageCovers).toEqual([]);
    expect(videosWithoutPosters).toEqual([]);
  }, 30_000);
});
