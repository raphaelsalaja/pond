import { useCallback, useEffect, useRef, useState } from "react";
import { clamp } from "@/shared/lib/math";

const SLIDE_SELECTOR = "[data-blossom-slide]";

function slideNodes(scroller: HTMLElement) {
  return scroller.querySelectorAll<HTMLElement>(SLIDE_SELECTOR);
}

function centeredIndex(scroller: HTMLElement): number {
  /** Slide rects are transform-aware, so the viewport must be too: clientWidth ignores an in-flight FLIP. */
  const rect = scroller.getBoundingClientRect();
  const viewportCenter = rect.left + rect.width / 2;
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  slideNodes(scroller).forEach((node, i) => {
    const rect = node.getBoundingClientRect();
    const dist = Math.abs((rect.left + rect.right) / 2 - viewportCenter);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  });
  return best;
}

function centerSlide(
  scroller: HTMLElement,
  index: number,
  behavior: ScrollBehavior,
) {
  const nodes = slideNodes(scroller);
  const slide = nodes[clamp(index, 0, nodes.length - 1)];
  if (!slide) return;
  const elRect = scroller.getBoundingClientRect();
  const slideRect = slide.getBoundingClientRect();
  const delta =
    slideRect.left + slideRect.width / 2 - (elRect.left + elRect.width / 2);
  if (Math.abs(delta) > 1)
    scroller.scrollTo({ left: scroller.scrollLeft + delta, behavior });
}

export function useLockedSlideRatio() {
  const [ratios, setRatios] = useState<ReadonlyMap<string, number>>(
    () => new Map(),
  );
  const reportRatio = useCallback((src: string, r: number) => {
    setRatios((prev) => {
      const cur = prev.get(src);
      if (cur != null && Math.abs(cur - r) < 0.01) return prev;
      const next = new Map(prev);
      next.set(src, r);
      return next;
    });
  }, []);
  return { ratios, reportRatio };
}

export function useActiveSlide(
  scroller: HTMLElement | null,
  _count: number,
): number {
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (!scroller) return;
    let frame = 0;
    const compute = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setActive(centeredIndex(scroller)));
    };
    compute();
    scroller.addEventListener("scroll", compute, { passive: true });
    const observer = new ResizeObserver(compute);
    observer.observe(scroller);
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", compute);
      observer.disconnect();
    };
  }, [scroller]);
  return active;
}

export function useCarouselNavigation(
  scroller: HTMLElement | null,
  _ratios: ReadonlyMap<string, number>,
) {
  const interactedRef = useRef(false);
  useEffect(() => {
    if (!scroller) return;
    const mark = () => {
      interactedRef.current = true;
    };
    scroller.addEventListener("pointerdown", mark, { passive: true });
    scroller.addEventListener("wheel", mark, { passive: true });
    return () => {
      scroller.removeEventListener("pointerdown", mark);
      scroller.removeEventListener("wheel", mark);
    };
  }, [scroller]);

  /** Native scroll-snap doesn't settle the first slide to centre on load; "instant" because Blossom sets scroll-behavior:smooth and "auto" would animate the slide in from the left. */
  useEffect(() => {
    if (!scroller || interactedRef.current) return;
    centerSlide(scroller, 0, "instant");
  }, [scroller]);

  const aimedIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (!scroller) return;
    const settle = () => {
      if (aimedIndexRef.current === centeredIndex(scroller))
        aimedIndexRef.current = null;
    };
    const release = () => {
      aimedIndexRef.current = null;
    };
    scroller.addEventListener("scrollend", settle);
    scroller.addEventListener("pointerdown", release, { passive: true });
    scroller.addEventListener("wheel", release, { passive: true });
    return () => {
      scroller.removeEventListener("scrollend", settle);
      scroller.removeEventListener("pointerdown", release);
      scroller.removeEventListener("wheel", release);
    };
  }, [scroller]);

  const step = useCallback(
    (delta: number): boolean => {
      if (!scroller) return false;
      const count = slideNodes(scroller).length;
      const from = aimedIndexRef.current ?? centeredIndex(scroller);
      const next = clamp(from + delta, 0, count - 1);
      if (next === from) return false;
      interactedRef.current = true;
      aimedIndexRef.current = next;
      centerSlide(scroller, next, "smooth");
      return true;
    },
    [scroller],
  );

  const goPrev = useCallback(() => {
    step(-1);
  }, [step]);
  const goNext = useCallback(() => {
    step(1);
  }, [step]);

  return { goPrev, goNext, step };
}
