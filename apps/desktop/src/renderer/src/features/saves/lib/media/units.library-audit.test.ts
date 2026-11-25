import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { isOriginalImageKind } from "@shared/save-file-names";
import { beforeAll, describe, expect, it } from "vitest";
import { normalise, SavePatchSchema } from "@/features/saves/lib/reconcile";
import type { Save } from "@/features/saves/types";
import { buildMediaUnits } from "./units";

const LIBRARY_PATH = process.env.POND_LIBRARY_PATH;

async function readSave(path: string): Promise<Save | null> {
  try {
    const raw = await readFile(path, "utf8");
    return normalise(SavePatchSchema.parse(JSON.parse(raw)));
  } catch {
    return null;
  }
}

async function readLibrary(libraryPath: string): Promise<Array<Save>> {
  const itemsDir = join(libraryPath, "items");
  const entries = await readdir(itemsDir, { withFileTypes: true });
  const saves = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name.endsWith(".info"))
      .map((entry) => readSave(join(itemsDir, entry.name, "info.json"))),
  );
  return saves.filter((save): save is Save => save !== null);
}

describe.skipIf(!LIBRARY_PATH)("live library media units", () => {
  let saves: Array<Save> = [];

  beforeAll(async () => {
    saves = await readLibrary(LIBRARY_PATH ?? "");
  });

  it("keeps image covers visible and gives every video a resting poster", () => {
    const missingImageCovers: Array<string> = [];
    const videosWithoutPosters: Array<string> = [];
    let imageCoverCount = 0;
    let videoCount = 0;

    for (const save of saves) {
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
        if (!unit.isVideo) continue;
        videoCount += 1;
        if (!unit.posterUrl) videosWithoutPosters.push(save.id);
      }
    }

    // oxlint-disable-next-line no-console -- the audit prints its library counts to the vitest output, where no app logger runs
    console.info(
      JSON.stringify(
        { saveCount: saves.length, imageCoverCount, videoCount },
        null,
        2,
      ),
    );
    expect(missingImageCovers).toEqual([]);
    expect(videosWithoutPosters).toEqual([]);
  });
});
