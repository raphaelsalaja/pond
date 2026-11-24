import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { isOriginalImageKind } from "@shared/save-file-names";
import { describe, expect, it } from "vitest";
import { normalise, SavePatchSchema } from "@/features/saves/lib/reconcile";
import type { Save } from "@/features/saves/types";
import { buildMediaUnits } from "./units";

const LIBRARY_PATH = process.env.POND_LIBRARY_PATH;
const describeLibrary = LIBRARY_PATH ? describe : describe.skip;

describeLibrary("live library media units", () => {
  it("keeps image covers visible and gives every video a resting poster", async () => {
    if (!LIBRARY_PATH) {
      return;
    }
    const itemsDir = join(LIBRARY_PATH, "items");
    const entries = await readdir(itemsDir, { withFileTypes: true });
    const missingImageCovers: Array<string> = [];
    const videosWithoutPosters: Array<string> = [];
    let saveCount = 0;
    let imageCoverCount = 0;
    let videoCount = 0;

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.endsWith(".info")) {
        continue;
      }
      let save: Save | null;
      try {
        const raw = await readFile(
          join(itemsDir, entry.name, "info.json"),
          "utf8",
        );
        save = normalise(SavePatchSchema.parse(JSON.parse(raw)));
      } catch {
        continue;
      }
      if (!save) {
        continue;
      }
      saveCount += 1;

      const files = save.files ?? [];
      const covers = files.filter((file) => isOriginalImageKind(file.kind));
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
        if (!unit.isVideo) {
          continue;
        }
        videoCount += 1;
        if (!unit.posterUrl) {
          videosWithoutPosters.push(save.id);
        }
      }
    }

    // oxlint-disable-next-line no-console -- the audit prints its library counts to the vitest output, where no app logger runs
    console.info(
      JSON.stringify({ saveCount, imageCoverCount, videoCount }, null, 2),
    );
    expect(missingImageCovers).toEqual([]);
    expect(videosWithoutPosters).toEqual([]);
  }, 30_000);
});
