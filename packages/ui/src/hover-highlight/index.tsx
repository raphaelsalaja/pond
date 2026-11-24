import { useRender } from "@base-ui/react/use-render";
import { clsx as cn } from "clsx";
import { useEffect, useRef } from "react";
import styles from "./styles.module.css";

const ROW =
  "[data-hover-row]:not([data-disabled], [aria-disabled='true'], :disabled)";

/** One fill that slides behind whichever `[data-hover-row]` the pointer is over. Its parent must be positioned and isolate. */
export function HoverHighlight({
  className,
  render,
  ref,
  ...props
}: useRender.ComponentProps<"div">) {
  const highlightRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const highlight = highlightRef.current;
    const host = highlight?.parentElement;
    if (!highlight || !host) return;
    let current: HTMLElement | null = null;
    let pointer: { x: number; y: number } | null = null;

    const place = (target: Element | null, instant: boolean) => {
      const hit = target?.closest<HTMLElement>(ROW) ?? null;
      /** A row that wraps another row only widens the hover area; the fill sits on the inner one. */
      const row = hit?.querySelector<HTMLElement>(ROW) ?? hit;
      if (row === current && !instant) return;
      current = row && host.contains(row) ? row : null;
      if (!current) {
        delete highlight.dataset.visible;
        return;
      }
      const origin = host.getBoundingClientRect();
      const box = current.getBoundingClientRect();
      const x = box.left - origin.left - host.clientLeft + host.scrollLeft;
      const y = box.top - origin.top - host.clientTop + host.scrollTop;
      const snap = instant || highlight.dataset.visible === undefined;
      if (snap) highlight.dataset.snap = "";
      highlight.style.width = `${box.width}px`;
      highlight.style.height = `${box.height}px`;
      highlight.style.borderRadius = getComputedStyle(current).borderRadius;
      highlight.style.transform = `translate(${x}px, ${y}px)`;
      highlight.dataset.visible = "";
      if (snap) {
        void highlight.offsetHeight;
        delete highlight.dataset.snap;
      }
    };

    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      pointer = { x: event.clientX, y: event.clientY };
      place(event.target as Element, false);
    };
    const leave = () => {
      pointer = null;
      place(null, false);
    };
    const scroll = () => {
      if (pointer) place(document.elementFromPoint(pointer.x, pointer.y), true);
    };
    /** A faded-out highlight left at its last row would still stretch the scroll height. */
    const park = (event: TransitionEvent) => {
      if (event.propertyName !== "opacity") return;
      if (highlight.dataset.visible !== undefined) return;
      highlight.style.width = "";
      highlight.style.height = "";
      highlight.style.transform = "";
    };

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    highlight.addEventListener("transitionend", park);
    document.addEventListener("scroll", scroll, {
      capture: true,
      passive: true,
    });
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
      highlight.removeEventListener("transitionend", park);
      document.removeEventListener("scroll", scroll, { capture: true });
    };
  }, []);

  return useRender({
    render,
    ref: [ref, highlightRef],
    defaultTagName: "div",
    props: {
      "aria-hidden": true,
      ...props,
      className: cn(styles.highlight, className),
    },
  });
}
