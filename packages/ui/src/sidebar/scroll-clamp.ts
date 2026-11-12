import { type RefObject, useEffect } from "react";
import { prefersReducedMotion } from "../shared/reduced-motion";

interface ScrollClampInput {
  scrollTop: number;
  clientHeight: number;
  content: number;
  previousContent: number;
  space: number;
  /** Unfloored content height when `content` is padded up to the viewport. */
  natural?: number;
}

function clampHeight(content: number, natural: number | undefined): number {
  return natural != null && natural < content ? natural : content;
}

/** Space the content needs below it to keep `scrollTop` reachable after shrinking, or null when no clamp happened. */
export function scrollClampSpace({
  scrollTop,
  clientHeight,
  content,
  previousContent,
  space,
  natural,
}: ScrollClampInput): number | null {
  /** A position of zero has nothing to ease. Anything above that, even a few pixels, is a real clamp. */
  if (scrollTop <= 0) return null;
  const height = clampHeight(content, natural);
  if (height >= previousContent) return null;
  const needed = Math.ceil(scrollTop + clientHeight - height);
  return needed > space ? needed : null;
}

/** Pixels of the hold spacer that only fill the viewport. The ease covers the rest. */
export function scrollClampFloor(
  input: Pick<ScrollClampInput, "clientHeight" | "content" | "natural">,
): number {
  return Math.max(
    0,
    Math.ceil(input.clientHeight - clampHeight(input.content, input.natural)),
  );
}

/**
 * `scrollHeight` never drops below the viewport, and a flex-grow sibling absorbs
 * free space, so a short list reports the viewport height. Measuring at
 * max-content reveals the real extent without that floor.
 */
function measureUnflooredContent(
  scroll: HTMLElement,
  space: HTMLElement,
): number {
  const top = scroll.scrollTop;
  const behavior = scroll.style.scrollBehavior;
  const snapshot = {
    height: scroll.style.height,
    minHeight: scroll.style.minHeight,
    flex: scroll.style.flex,
  };
  scroll.style.scrollBehavior = "auto";
  scroll.style.flex = "none";
  scroll.style.minHeight = "0px";
  scroll.style.height = "max-content";
  try {
    return scroll.scrollHeight - space.offsetHeight;
  } finally {
    scroll.style.height = snapshot.height;
    scroll.style.minHeight = snapshot.minHeight;
    scroll.style.flex = snapshot.flex;
    if (scroll.scrollTop !== top) scroll.scrollTop = top;
    scroll.style.scrollBehavior = behavior;
  }
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
    const initial = scroll.scrollHeight - space.offsetHeight;
    let scrollTop = scroll.scrollTop;
    let content =
      initial > scroll.clientHeight
        ? initial
        : measureUnflooredContent(scroll, space);
    let running = false;
    let settle: ((event: TransitionEvent) => void) | null = null;

    const cancelSettle = () => {
      if (!settle) return;
      space.removeEventListener("transitionend", settle);
      settle = null;
    };

    const check = (remeasure: boolean) => {
      if (running) return;
      running = true;
      try {
        const current = space.offsetHeight;
        const previousContent = content;
        const reported = scroll.scrollHeight - current;
        const height =
          reported > scroll.clientHeight
            ? reported
            : remeasure
              ? measureUnflooredContent(scroll, space)
              : content;
        content = height;
        const natural = height < reported ? height : undefined;
        const next = scrollClampSpace({
          scrollTop,
          clientHeight: scroll.clientHeight,
          content: reported,
          previousContent,
          space: current,
          natural,
        });
        if (next === null || prefersReducedMotion()) return;
        const floor = Math.min(
          next,
          scrollClampFloor({
            clientHeight: scroll.clientHeight,
            content: reported,
            natural,
          }),
        );
        cancelSettle();
        const behavior = scroll.style.scrollBehavior;
        space.style.transition = "none";
        space.style.height = `${next}px`;
        /** Smooth scrolling defers a short restore, so the hold never lands before the spacer starts easing. */
        scroll.style.scrollBehavior = "auto";
        scroll.scrollTop = scrollTop;
        scroll.style.scrollBehavior = behavior;
        /** Reading layout commits the held height, so the shrink transitions from it. */
        void space.offsetHeight;
        space.style.removeProperty("transition");
        if (floor > 0) {
          space.style.height = `${floor}px`;
          settle = (event) => {
            if (event.propertyName !== "height") return;
            cancelSettle();
            space.style.transition = "none";
            space.style.removeProperty("height");
          };
          space.addEventListener("transitionend", settle);
        } else {
          space.style.removeProperty("height");
        }
      } finally {
        running = false;
      }
    };

    const resize = new ResizeObserver(() => check(true));
    const observeChildren = () => {
      resize.disconnect();
      for (const child of scroll.children) {
        if (child !== space) resize.observe(child);
      }
    };
    /** Removed children resize nothing, so the mutation itself triggers the check. */
    const mutation = new MutationObserver(() => {
      observeChildren();
      check(true);
    });
    /** A layout forced mid-commit clamps before any observer runs; its scroll event still precedes paint. */
    const onScroll = () => {
      if (running) return;
      check(false);
      scrollTop = scroll.scrollTop;
    };

    observeChildren();
    mutation.observe(scroll, { childList: true });
    scroll.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelSettle();
      resize.disconnect();
      mutation.disconnect();
      scroll.removeEventListener("scroll", onScroll);
    };
  }, [scrollRef, spaceRef]);
}
