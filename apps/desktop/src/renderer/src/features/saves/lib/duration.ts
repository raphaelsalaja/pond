import type { Save } from "@/features/saves/types";

export function saveDuration(save: Save): number | null {
  const raw = save.rawJson;
  const captureDuration = raw?.capture?.duration;
  if (
    captureDuration !== undefined &&
    captureDuration !== null &&
    captureDuration > 0
  ) {
    return captureDuration;
  }
  const mediaDuration = raw?.capture?.media.find(
    (media) =>
      media.durationSec !== undefined &&
      media.durationSec !== null &&
      media.durationSec > 0,
  )?.durationSec;
  if (mediaDuration !== undefined && mediaDuration !== null) {
    return mediaDuration;
  }
  const ytdlpDuration = raw?.ytdlp?.duration;
  return ytdlpDuration !== undefined &&
    ytdlpDuration !== null &&
    ytdlpDuration > 0
    ? ytdlpDuration
    : null;
}
