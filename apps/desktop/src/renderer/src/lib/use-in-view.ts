import { type RefObject, useEffect, useState } from "react";

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
