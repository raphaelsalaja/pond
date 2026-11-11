import { type RefObject, useEffect } from "react";
import { prefersReducedMotion } from "../shared/reduced-motion";

interface ScrollClampInput {
  scrollTop: number;
  clientHeight: number;
  content: number;
  previousContent: number;
  space: number;
}

/** Space the content needs below it to keep `scrollTop` reachable after shrinking, or null when no clamp happened. */
export function scrollClampSpace({
  scrollTop,
  clientHeight,
  content,
  previousContent,
  space,
}: ScrollClampInput): number | null {
  if (content >= previousContent) return null;
  const needed = Math.ceil(scrollTop + clientHeight - content);
  return needed > space ? needed : null;
}

/** Content that shrinks under the scroll position keeps that position, then a spacer eases it to the new end. */
export function useEasedScrollClamp(
  scrollRef: RefObject<HTMLElement | null>,
  spaceRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const scroll = scrollRef.current;
    const space = spaceRef.current;
    if (!scroll || !space || !("ResizeObserver" in window)) return;
    let scrollTop = scroll.scrollTop;
    let content = scroll.scrollHeight - space.offsetHeight;

    const check = () => {
      const current = space.offsetHeight;
      const previousContent = content;
      content = scroll.scrollHeight - current;
      const next = scrollClampSpace({
        scrollTop,
        clientHeight: scroll.clientHeight,
        content,
        previousContent,
        space: current,
      });
      if (next === null || prefersReducedMotion()) return;
      space.style.transition = "none";
      space.style.height = `${next}px`;
      scroll.scrollTop = scrollTop;
      /** Reading layout commits the held height, so the shrink transitions from it. */
      void space.offsetHeight;
      space.style.removeProperty("transition");
      space.style.removeProperty("height");
    };

    const resize = new ResizeObserver(check);
    const observeChildren = () => {
      resize.disconnect();
      for (const child of scroll.children) {
        if (child !== space) resize.observe(child);
      }
    };
    /** Removed children resize nothing, so the mutation itself triggers the check. */
    const mutation = new MutationObserver(() => {
      observeChildren();
      check();
    });
    /** A layout forced mid-commit clamps before any observer runs; its scroll event still precedes paint. */
    const onScroll = () => {
      check();
      scrollTop = scroll.scrollTop;
    };

    observeChildren();
    mutation.observe(scroll, { childList: true });
    scroll.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      resize.disconnect();
      mutation.disconnect();
      scroll.removeEventListener("scroll", onScroll);
    };
  }, [scrollRef, spaceRef]);
}
