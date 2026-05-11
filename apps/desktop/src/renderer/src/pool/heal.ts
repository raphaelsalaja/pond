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
 * Retry-before-heal
 *
 *   A `pond://` 404 can fire transiently while the executor is
 *   replacing files on disk (delete old → write new). Before queuing
 *   yt-dlp we wait 500ms and HEAD the video URL once more; if it
 *   comes back 200 the `<video>` just hit a write-race and we skip
 *   the heal entirely.
 *
 * Failure modes
 *
 *   The main-side helper returns `{ ok: false, reason }` for the cases
 *   where there's nothing yt-dlp can do (image-only sources, deleted
 *   saves, missing URL). We log those at debug level — the placeholder
 *   the renderer is already painting is the right end state.
 */

const STORAGE_KEY = "pond-heal-attempted";
const RETRY_DELAY_MS = 500;

function loadAttempted(): Set<string> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* corrupted entry; start fresh */
  }
  return new Set<string>();
}

function persistAttempted(set: Set<string>): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* storage full or unavailable; non-critical */
  }
}

const attempted = loadAttempted();

/**
 * Schedule a heal for `saveId`. If `videoSrc` is provided the helper
 * retries the URL once after a short delay before asking main to
 * redownload — this absorbs the transient 404 that fires while the
 * executor is replacing files on disk.
 */
export function requestVideoHeal(saveId: string, videoSrc?: string): void {
  if (!saveId) return;
  if (attempted.has(saveId)) return;
  attempted.add(saveId);
  persistAttempted(attempted);

  if (videoSrc) {
    setTimeout(() => retryThenHeal(saveId, videoSrc), RETRY_DELAY_MS);
  } else {
    dispatchHeal(saveId);
  }
}

async function retryThenHeal(saveId: string, videoSrc: string): Promise<void> {
  try {
    const res = await fetch(videoSrc, { method: "HEAD" });
    if (res.ok) {
      console.debug("[pond heal] retry succeeded, skipping heal", saveId);
      return;
    }
  } catch {
    /* network / protocol error — fall through to heal */
  }
  dispatchHeal(saveId);
}

function dispatchHeal(saveId: string): void {
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
