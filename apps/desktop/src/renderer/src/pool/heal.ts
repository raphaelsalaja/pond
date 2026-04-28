/**
 * Renderer-side auto-heal for unplayable videos.
 *
 * Triggered from every place we render a `<video>` element: the grid
 * thumb (`HoverVideo`), the right-rail preview carousel, and the
 * fullscreen lightbox. When the element fires `onError` — almost always
 * because Electron's bundled ffmpeg can't decode a previously-downloaded
 * AV1/HEVC stream — we ask main to re-run yt-dlp with the new
 * H.264-only selector and overwrite the bad bytes.
 *
 * Per-session dedup
 *
 *   The same broken save can mount multiple `<video>` elements
 *   simultaneously (grid card + preview pane + lightbox). All three
 *   error in the same paint frame; without dedup we'd queue three
 *   redundant downloads. The `attempted` set caps it at one heal per
 *   save per renderer session.
 *
 *   We also cap to one heal per save per *lifetime of the broken bytes*
 *   on disk — if the heal lands a video that's *also* unplayable
 *   (extremely unlikely after the avc1 constraint, but possible if
 *   yt-dlp's fallbacks pick something exotic), we don't want an
 *   infinite redownload loop. A second `onError` on the same id within
 *   the same session is silently ignored; the user's manual Refresh
 *   button is the escape hatch.
 *
 * Failure modes
 *
 *   The main-side helper returns `{ ok: false, reason }` for the cases
 *   where there's nothing yt-dlp can do (image-only sources, deleted
 *   saves, missing URL). We log those at debug level — the placeholder
 *   the renderer is already painting is the right end state.
 */

const attempted = new Set<string>();

export function requestVideoHeal(saveId: string): void {
  if (!saveId) return;
  if (attempted.has(saveId)) return;
  attempted.add(saveId);

  // Tolerate older preload bundles during dev hot-reload — the IPC
  // landed in this commit, so a renderer talking to a stale preload
  // would otherwise throw `is not a function`. Better to silently
  // skip than crash the card.
  const fn = (
    window.pond as unknown as {
      redownloadVideo?: (id: string) => Promise<unknown>;
    }
  ).redownloadVideo;
  if (typeof fn !== "function") {
    console.debug("[pond heal] redownloadVideo IPC not available", saveId);
    return;
  }

  fn(saveId)
    .then((res) => {
      console.debug("[pond heal] redownload response", saveId, res);
    })
    .catch((err: unknown) => {
      console.debug("[pond heal] redownload threw", saveId, err);
    });
}
