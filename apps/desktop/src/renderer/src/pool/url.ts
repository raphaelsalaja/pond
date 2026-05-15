import type { RawSaveMetadata } from "@pond/schema/raw";
import type { Save, SaveFile } from "./types";

export function buildPondUrl(saveId: string, file: SaveFile): string {
  const base = `pond://${saveId}/${file.path}`;
  const bust = cacheBuster(file);
  return bust ? `${base}?v=${bust}` : base;
}

export function buildAvatarUrl(avatarPath: string): string {
  const filename = avatarPath.replace(/^.*[\\/]/, "");
  return `pond://_meta/${filename}`;
}

export function pickAuthorAvatarUrl(save: Save): string | null {
  const local = (save.files ?? []).find((f) => f.kind === "avatar");
  if (local) return buildPondUrl(save.id, local);

  const raw = (save.rawJson ?? null) as RawSaveMetadata | null;
  if (!raw) return null;
  const candidates: Array<string | undefined> = [
    raw.twitter?.authorAvatar,
    raw.instagram?.authorAvatar,
    raw.tiktok?.authorAvatar,
    raw.pinterest?.authorAvatar,
    raw.arena?.authorAvatar,
  ];
  for (const url of candidates) {
    if (typeof url === "string" && url.trim().length > 0) return url;
  }
  return null;
}

function cacheBuster(file: SaveFile): string | null {
  if (file.sha256 && file.sha256.length >= 8) {
    return file.sha256.slice(0, 12);
  }
  return null;
}
