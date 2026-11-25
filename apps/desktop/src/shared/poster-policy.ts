import type { Source } from "@pond/schema/db";

/** YouTube posters are the platform's cover image, not a frame of the video file; other posters are first-frame extractions. */
export function usesPlatformPoster(source: Source | null | undefined): boolean {
  return source === "youtube";
}
