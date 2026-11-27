import type { SaveFile, Source } from "@pond/schema/db";
import { POSTER_KIND } from "./save-file-names";

/** YouTube and Instagram ingest uses the platform's cover image; other sources extract posters from the video's first frame. */
export function usesPlatformPoster(source: Source | null | undefined): boolean {
  return source === "youtube" || source === "instagram";
}

/** YouTube posters predate provenance; Instagram marks downloaded covers with `sourceUrl` so extracted first frames stay same-file. */
export function posterIsCrossFile(
  poster: Pick<SaveFile, "kind" | "sourceUrl">,
  source: Source | null | undefined,
): boolean {
  if (poster.kind !== POSTER_KIND) return true;
  if (source === "youtube") return true;
  if (source === "instagram") return Boolean(poster.sourceUrl);
  return false;
}
