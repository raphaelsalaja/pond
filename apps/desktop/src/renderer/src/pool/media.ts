import type { Save, SaveFile } from "./types";
import { buildPondUrl } from "./url";

export interface MediaUnit {
  key: string;
  url: string;
  isVideo: boolean;
  posterUrl?: string;
}

export function buildMediaUnits(save: Save): MediaUnit[] {
  const files = (save.files ?? []).filter((f) => f.kind !== "avatar");

  const videos: SaveFile[] = [];
  const posters: SaveFile[] = [];
  const covers: SaveFile[] = [];
  const others: SaveFile[] = [];
  for (const f of files) {
    if (isVideoFile(f)) videos.push(f);
    else if (f.kind === "poster") posters.push(f);
    else if (f.kind === "cover" || f.kind === "media") covers.push(f);
    else others.push(f);
  }

  const consumedCovers = new Set<string>();
  const units: MediaUnit[] = [];

  for (let i = 0; i < videos.length; i++) {
    const v = videos[i];
    if (!v) continue;
    const generated = posters[i];
    const fallback = covers[i];
    const poster = generated ?? fallback;
    if (poster) consumedCovers.add(poster.path);
    if (fallback) consumedCovers.add(fallback.path);
    units.push({
      key: v.path,
      url: buildPondUrl(save.id, v),
      isVideo: true,
      posterUrl: poster ? buildPondUrl(save.id, poster) : undefined,
    });
  }

  for (const c of covers) {
    if (consumedCovers.has(c.path)) continue;
    units.push({
      key: c.path,
      url: buildPondUrl(save.id, c),
      isVideo: false,
    });
  }

  for (const o of others) {
    units.push({
      key: o.path,
      url: buildPondUrl(save.id, o),
      isVideo: false,
    });
  }

  return units;
}

export function pickPrimaryUnit(save: Save): MediaUnit | null {
  const units = buildMediaUnits(save);
  const video = units.find((u) => u.isVideo);
  if (video) return video;
  return units[0] ?? null;
}

function isVideoFile(file: SaveFile): boolean {
  if (file.kind === "video") return true;
  if (file.mimeType?.startsWith("video/") === true) return true;
  return /\.(mp4|webm|mov|m4v|mkv)$/i.test(file.path);
}
