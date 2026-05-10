import type { RawSaveMetadata } from "@pond/schema/raw";
import type { Save, SaveFile } from "./types";

/**
 * Build a `pond://<id>/<path>?v=<bust>` URL for a save's on-disk file.
 *
 * Why the cache-buster: the renderer caches `pond://` responses (incl.
 * 404s) keyed by URL. After a Refresh that heals an orphaned save by
 * re-downloading the bytes, the path stays the same (`cover.jpg`),
 * so the browser would otherwise serve the stale 404 from cache and
 * the card would never repaint with the freshly-written file. We key
 * the buster off the file's sha256 because:
 *
 *   - It's stable as long as the bytes don't change → no needless
 *     cache misses on benign re-renders.
 *   - It guarantees a brand-new URL the moment the bytes do change
 *     (re-fetch always produces a new hash unless the source is
 *     byte-identical, in which case skipping the network is correct).
 *
 * The protocol handler reads only `url.pathname`, so the query string
 * is invisible to disk lookup — see `apps/desktop/src/main/protocol.ts`.
 */
export function buildPondUrl(saveId: string, file: SaveFile): string {
  const base = `pond://${saveId}/${file.path}`;
  const bust = cacheBuster(file);
  return bust ? `${base}?v=${bust}` : base;
}

/**
 * Resolve the best author-avatar URL for a save.
 *
 * The ingest pipeline always tries to pull the scraped `raw.<source>.authorAvatar`
 * onto disk as a `kind: "avatar"` `SaveFile` (see `fetchAvatarToTxFile` in
 * `apps/desktop/src/main/lib/blob.ts`). We strongly prefer that local copy:
 *
 *   - works offline,
 *   - survives the upstream user changing their profile photo (Twitter rotates
 *     the `_400x400` URL on every change), and
 *   - sidesteps hotlink / referer / rate-limit blocks on third-party CDNs.
 *
 * Falls back to the original `rawJson.<source>.authorAvatar` URL only for
 * older saves whose avatars predate the local-file feature, so the chrome
 * still renders something while the next refresh hydrates the on-disk copy.
 *
 * Returns `null` when no avatar is known on either path — callers render the
 * deterministic colour dot instead.
 */
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
  // sha256 is the right primary signal — content-addressed, so any
  // change to the bytes flips it and stale entries can't survive.
  if (file.sha256 && file.sha256.length >= 8) {
    return file.sha256.slice(0, 12);
  }
  // Defensive fallback: a partial sha or empty string would still
  // benefit from *some* per-byte-set salt, but we have nothing else
  // on `SaveFile` that updates atomically with the bytes. Returning
  // null here just means we silently skip the buster — same behaviour
  // we had before this helper existed, so we don't regress.
  return null;
}
