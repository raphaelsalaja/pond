const MAX_RETAINED_PREVIEWS = 256;
const MAX_CONCURRENT_PRELOADS = 4;

const retained = new Map<string, HTMLImageElement>();
const inflight = new Map<string, HTMLImageElement>();
let desired = new Set<string>();
let queued: string[] = [];

/**
 * Keeps a small set of low-resolution previews decoded just beyond the virtual
 * window. Replacing the runway drops stale queued work while bounded retention
 * lets nearby back-scrolling reuse Chromium's decoded image.
 */
export function retainPreviewRunway(sources: readonly string[]): void {
  desired = new Set(sources);
  queued = [];

  for (const src of desired) {
    const cached = retained.get(src);
    if (cached) {
      retained.delete(src);
      retained.set(src, cached);
      continue;
    }
    if (!inflight.has(src)) queued.push(src);
  }
  pump();
}

function pump(): void {
  if (typeof Image === "undefined") return;
  while (inflight.size < MAX_CONCURRENT_PRELOADS) {
    const src = queued.shift();
    if (!src) return;
    if (!desired.has(src) || retained.has(src) || inflight.has(src)) continue;

    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = "low";
    inflight.set(src, image);

    const settle = (ready: boolean) => {
      image.onload = null;
      image.onerror = null;
      inflight.delete(src);
      if (ready && desired.has(src)) {
        retained.set(src, image);
        trimRetained();
      }
      pump();
    };
    image.onload = () => {
      const decoded = image.decode?.();
      if (!decoded) {
        settle(image.naturalWidth > 0);
        return;
      }
      void decoded.then(
        () => settle(true),
        () => settle(image.naturalWidth > 0),
      );
    };
    image.onerror = () => settle(false);
    image.src = src;
  }
}

function trimRetained(): void {
  while (retained.size > MAX_RETAINED_PREVIEWS) {
    const oldest = retained.keys().next().value;
    if (typeof oldest !== "string") return;
    retained.delete(oldest);
  }
}
