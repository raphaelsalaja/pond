import { type RefObject, useEffect, useState } from "react";

/**
 * Reports whether `ref.current` is in (or near) the viewport, gated by
 * a single shared `IntersectionObserver` so a 1k-card grid is one
 * observer + N entries, not N observers.
 *
 * `rootMargin: "200px"` primes media just before the card scrolls into
 * view so there's no visible "pop in" lag — this is the same heuristic
 * the browser uses for native `loading="lazy"`.
 *
 * Used by `<video>` thumbnails to delay `preload="metadata"` until the
 * card is actually about to be seen, so a library with dozens of video
 * saves doesn't kick off dozens of concurrent demuxer setups on first
 * paint.
 */

const targets = new WeakMap<Element, Set<(visible: boolean) => void>>();
let sharedObserver: IntersectionObserver | null = null;

function ensureObserver(): IntersectionObserver {
  if (sharedObserver) return sharedObserver;
  sharedObserver = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const subs = targets.get(e.target);
        if (!subs) continue;
        for (const cb of subs) cb(e.isIntersecting);
      }
    },
    { rootMargin: "200px" },
  );
  return sharedObserver;
}

export function useInView<T extends Element>(
  ref: RefObject<T | null>,
): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = ensureObserver();
    let subs = targets.get(el);
    if (!subs) {
      subs = new Set();
      targets.set(el, subs);
    }
    subs.add(setVisible);
    observer.observe(el);
    return () => {
      subs?.delete(setVisible);
      if (subs && subs.size === 0) {
        observer.unobserve(el);
        targets.delete(el);
      }
    };
  }, [ref]);
  return visible;
}
