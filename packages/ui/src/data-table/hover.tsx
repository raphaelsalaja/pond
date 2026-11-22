import { useEffect, useRef } from "react";
import styles from "./styles.module.css";

/** One highlight behind the body rows that slides to whichever row the pointer is over. */
export function DataTableHover() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const highlight = ref.current;
    const sheet = highlight?.parentElement;
    const viewport = sheet?.closest<HTMLElement>("[data-viewport]");
    if (!highlight || !sheet || !viewport) return;
    let current: HTMLElement | null = null;
    let pointer: { x: number; y: number } | null = null;

    const place = (target: Element | null, instant: boolean) => {
      const row = target?.closest<HTMLElement>(`.${styles.row}`) ?? null;
      if (row === current && !instant) return;
      current = row && sheet.contains(row) ? row : null;
      if (!current) {
        delete highlight.dataset.visible;
        return;
      }
      const origin = sheet.getBoundingClientRect();
      const box = current.getBoundingClientRect();
      const snap = instant || highlight.dataset.visible === undefined;
      if (snap) highlight.style.transition = "none";
      highlight.style.width = `${box.width}px`;
      highlight.style.height = `${box.height}px`;
      highlight.style.transform = `translate(${box.left - origin.left}px, ${box.top - origin.top}px)`;
      highlight.dataset.visible = "";
      if (snap) {
        void highlight.offsetHeight;
        highlight.style.transition = "";
      }
    };

    const move = (event: PointerEvent) => {
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

    sheet.addEventListener("pointermove", move);
    sheet.addEventListener("pointerleave", leave);
    viewport.addEventListener("scroll", scroll, { passive: true });
    return () => {
      sheet.removeEventListener("pointermove", move);
      sheet.removeEventListener("pointerleave", leave);
      viewport.removeEventListener("scroll", scroll);
    };
  }, []);

  return <div ref={ref} className={styles.hover} aria-hidden />;
}
