import type { SaveFile, Source } from "@pond/schema/db";
import { POSTER_KIND } from "./save-file-names";

/** YouTube posters are the platform's cover image, not a frame of the video file; other posters are first-frame extractions. */
export function usesPlatformPoster(source: Source | null | undefined): boolean {
  return source === "youtube";
}

/** A poster is same-file only when it was extracted from the video's first frame; a cover image media file never is. */
export function posterIsCrossFile(
  poster: Pick<SaveFile, "kind">,
  source: Source | null | undefined,
): boolean {
  if (poster.kind !== POSTER_KIND) return true;
  return usesPlatformPoster(source);
}
