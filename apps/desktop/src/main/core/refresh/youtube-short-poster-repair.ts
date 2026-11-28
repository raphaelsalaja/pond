import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { saves } from "@pond/schema/db";
import type { SaveFile } from "@pond/schema/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb } from "../../db";
import { isYoutubeAutomaticFrame } from "../../lib/youtube-thumbnail";
import { resolvePaths } from "../../paths";
import { runEnsurePoster } from "../pipeline/workers/ensure-poster";

/** Bump to look at every YouTube poster once more on the next launch. */
const REPAIR_VERSION = 1;

interface PosterRow {
  id: string;
  files: Array<SaveFile> | null;
}

interface ShortPosterRepairRuntime {
  listYoutubeSaves: () => Promise<Array<PosterRow>>;
  ensurePoster: (saveId: string) => Promise<void>;
  readMarker: () => Promise<string | null>;
  writeMarker: (value: string) => Promise<void>;
}

function markerPath(): string {
  const { indexesDir, libraryId } = resolvePaths();
  return join(indexesDir, `${libraryId}.youtube-short-poster-repair`);
}

const defaultRuntime: ShortPosterRepairRuntime = {
  listYoutubeSaves: async () => {
    const db = await getDb();
    return db
      .select({ id: saves.id, files: saves.files })
      .from(saves)
      .where(
        and(
          eq(saves.source, "youtube"),
          inArray(saves.status, ["complete", "failed"]),
          isNull(saves.deletedAt),
        ),
      )
      .all();
  },
  ensurePoster: (saveId) => runEnsurePoster(saveId, { force: true }),
  readMarker: () => readFile(markerPath(), "utf8").catch(() => null),
  writeMarker: (value) => writeFile(markerPath(), value, "utf8"),
};

/** Posters saved from a frame YouTube picked, before Pond preferred a Short's display cover. */
function hasAutomaticFramePoster(
  files: ReadonlyArray<SaveFile> | null,
): boolean {
  return (files ?? []).some(
    (file) => file.kind === "poster" && isYoutubeAutomaticFrame(file.sourceUrl),
  );
}

/**
 * Fetches the poster again, once per Library, for each YouTube Save whose
 * poster came from an automatic frame. A Short without a display cover lands
 * on the same frame again, so the pass does not repeat on later launches.
 */
export async function repairYoutubeShortPosters(
  runtime: ShortPosterRepairRuntime = defaultRuntime,
): Promise<{ repaired: number }> {
  const marker = await runtime.readMarker();
  if (Number(marker?.trim()) >= REPAIR_VERSION) return { repaired: 0 };

  let repaired = 0;
  for (const row of await runtime.listYoutubeSaves()) {
    if (!hasAutomaticFramePoster(row.files)) continue;
    try {
      await runtime.ensurePoster(row.id);
      repaired += 1;
    } catch (error) {
      log.warn("[pond youtube-short-poster-repair] failed", row.id, error);
    }
  }

  await runtime
    .writeMarker(String(REPAIR_VERSION))
    .catch((cause: unknown) =>
      log.warn("[pond youtube-short-poster-repair] marker write failed", cause),
    );
  log.info("[pond youtube-short-poster-repair] done", { repaired });
  return { repaired };
}
