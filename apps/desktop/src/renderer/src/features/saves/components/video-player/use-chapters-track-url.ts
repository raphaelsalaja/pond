import { useEffect, useState } from "react";
import { chaptersToVttUrl } from "@/features/saves/lib/media/chapters-vtt";
import type { ChapterCue } from "@/features/saves/lib/media/chapters-vtt";

export function useChaptersTrackUrl(
  chapters?: ReadonlyArray<ChapterCue>,
): string | null {
  const [track, setTrack] = useState<{
    chapters: ReadonlyArray<ChapterCue>;
    url: string | null;
  } | null>(null);
  useEffect(() => {
    if (!chapters || chapters.length === 0) {
      return;
    }
    const next = chaptersToVttUrl(chapters);
    // oxlint-disable-next-line react/set-state-in-effect -- the blob URL is created and revoked by this effect so StrictMode remounts never reuse a revoked URL
    setTrack({ chapters, url: next });
    return () => {
      if (next) URL.revokeObjectURL(next);
    };
  }, [chapters]);
  return track && track.chapters === chapters ? track.url : null;
}
