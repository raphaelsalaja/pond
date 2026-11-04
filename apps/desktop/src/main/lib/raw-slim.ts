import type { RawJson } from "@pond/schema/raw";

export function slimRawJson(raw: RawJson | null | undefined): RawJson | null {
  if (!raw) return null;
  const cap = raw.capture;
  const capture: RawJson["capture"] = {
    id: cap.id,
    source: cap.source,
    url: cap.url,
    media: (cap.media ?? []).map((m) => {
      const media: RawJson["capture"]["media"][number] = {
        url: m.url,
        type: m.type,
      };
      if (m.durationSec != null) media.durationSec = m.durationSec;
      return media;
    }),
  };
  if (cap.author?.avatarUrl)
    capture.author = { avatarUrl: cap.author.avatarUrl };
  if (cap.duration != null) capture.duration = cap.duration;
  if (cap.extras?.product) capture.extras = { product: true };

  const slim: RawJson = {
    capture,
    extractorId: raw.extractorId,
    extractedAt: raw.extractedAt,
  };
  if (raw.ytdlp?.duration != null)
    slim.ytdlp = { duration: raw.ytdlp.duration };
  if (raw.split) slim.split = raw.split;
  return slim;
}

export function withRawSlim<T extends { rawJson?: RawJson | null }>(
  values: T,
): T & { rawSlim?: RawJson | null } {
  if (!("rawJson" in values)) return values;
  return { ...values, rawSlim: slimRawJson(values.rawJson) };
}
