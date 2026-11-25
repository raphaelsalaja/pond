import type { Save } from "@pond/schema/db";
import { saveFile } from "../paths";
import { persistSave } from "./persist-save";

export async function analyzeSaveColors(
  row: Save,
  force: boolean,
  actorReason = force ? "color:reanalyze" : "color:backfill",
): Promise<boolean> {
  const { extractPalette } = await import("../lib/palette");
  const { encodeBlurhash, pickBlurhashStill } = await import("../lib/blurhash");
  const { encodePhash } = await import("../lib/phash");
  const still = pickBlurhashStill(row);
  if (!still) return false;
  const needsColors =
    row.mediaType === "image" &&
    (force || (row.dominantColors ?? []).length === 0);
  const needsHash = force || !row.blurhash;
  const needsPerceptualHash =
    row.mediaType === "image" && (force || !row.phash);
  if (!needsColors && !needsHash && !needsPerceptualHash) return false;
  const path = saveFile(row.id, still.path);
  const patch: Parameters<typeof persistSave>[1] = {};
  if (needsColors) {
    const colors = await extractPalette(path);
    if (colors.length > 0) patch.dominantColors = colors;
  }
  if (needsHash) {
    const hash = await encodeBlurhash(path);
    if (hash) patch.blurhash = hash;
  }
  if (needsPerceptualHash) {
    const hash = await encodePhash(path);
    if (hash) patch.phash = hash;
  }
  if (Object.keys(patch).length === 0) return false;
  await persistSave(row.id, patch, { actorReason });
  return true;
}
