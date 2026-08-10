import { useCallback, useLayoutEffect, useRef, useState } from "react";

type ScrollEdges = "" | "start" | "end" | "start end";

/** Tracks which edges of a scroll viewport currently have clipped content. */
export function useScrollFade<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState<ScrollEdges>("");

  const update = useCallback(() => {
    const element = ref.current;
    if (!element) return;

    const canScrollStart = element.scrollTop > 1;
    const canScrollEnd =
      element.scrollTop + element.clientHeight < element.scrollHeight - 1;
    const next = [canScrollStart && "start", canScrollEnd && "end"]
      .filter(Boolean)
      .join(" ") as ScrollEdges;

    setEdges((current) => (current === next ? current : next));
  }, []);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const resizeObserver = new ResizeObserver(update);
    const observeLayout = () => {
      resizeObserver.disconnect();
      resizeObserver.observe(element);
      for (const child of element.children) resizeObserver.observe(child);
      update();
    };
    const mutationObserver = new MutationObserver(observeLayout);

    observeLayout();
    element.addEventListener("scroll", update, { passive: true });
    mutationObserver.observe(element, { childList: true, subtree: true });

    return () => {
      element.removeEventListener("scroll", update);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [update]);

  return { ref, "data-scroll-fade": "", "data-scrollable": edges } as const;
}
