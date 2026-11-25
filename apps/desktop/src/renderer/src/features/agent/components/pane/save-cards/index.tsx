import { IconFile } from "@pond/icons";
import { Popover } from "@pond/ui";
import type { AssistantSource } from "@shared/assistant";
import { useEffect, useRef } from "react";
import { SaveTile } from "@/features/saves";
import { SavePreview, toReferenceItems } from "../consulted-saves";
import { SourceThumbnail, useSourceCovers } from "../save-preview";
import styles from "./styles.module.css";

/** How wide each card is, so a reply's row of Saves reads like a strip of the Library grid. */
const CARD_WIDTH = 156;

/** Wheel deltas come in pixels, lines or pages; keep a notch a comparable step in each mode. */
function wheelPixels(event: WheelEvent, viewport: number): number {
  if (event.deltaMode === 1) return event.deltaY * 16;
  if (event.deltaMode === 2) return event.deltaY * viewport;
  return event.deltaY;
}

/**
 * A vertical wheel over a sideways-only strip would scroll the conversation instead.
 * Feed it to the strip until it reaches an end, then hand the wheel back.
 */
function useStripWheel(enabled: boolean) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const strip = ref.current;
    if (!enabled || !strip) return;
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const max = strip.scrollWidth - strip.clientWidth;
      if (max <= 0) return;
      const atStart = strip.scrollLeft <= 0;
      const atEnd = strip.scrollLeft >= max - 1;
      if ((event.deltaY > 0 && atEnd) || (event.deltaY < 0 && atStart)) return;
      event.preventDefault();
      strip.scrollTo({
        left: strip.scrollLeft + wheelPixels(event, strip.clientWidth),
        behavior: "instant",
      });
    };
    strip.addEventListener("wheel", onWheel, { passive: false });
    return () => strip.removeEventListener("wheel", onWheel);
  }, [enabled]);
  return ref;
}

/** The Saves a reply consulted, drawn with the Library's own cards; each opens a preview to open or attach it. */
export function SaveCards({
  sources,
  saveIds,
  attachedIds = [],
  onOpenSave,
  onAttach,
}: {
  sources: AssistantSource[];
  saveIds?: string[];
  attachedIds?: string[];
  onOpenSave: (id: string) => void;
  onAttach: (sources: AssistantSource[]) => void;
}) {
  const items = toReferenceItems(
    saveIds ?? sources.map((source) => source.id),
    sources,
    (source) => <SourceThumbnail id={source.id} source={source} visual />,
  );
  useSourceCovers(items.map((item) => item.id));
  const strip = useStripWheel(items.length > 0);
  if (!items.length) return null;
  return (
    <section
      ref={strip}
      className={styles.cards}
      aria-label="Consulted Saves"
      data-scroll-fade="horizontal"
    >
      {items.map((item) => (
        <Popover.Root key={item.id}>
          <Popover.Trigger
            render={(props) => (
              <SaveTile
                {...props}
                saveId={item.id}
                width={CARD_WIDTH}
                badges={false}
                fallback={{ icon: <IconFile />, title: item.title }}
              />
            )}
            aria-label={`Preview ${item.title}`}
          />
          <SavePreview
            item={item}
            sources={sources}
            attachedIds={attachedIds}
            onOpenSave={onOpenSave}
            onAttach={onAttach}
          />
        </Popover.Root>
      ))}
    </section>
  );
}
