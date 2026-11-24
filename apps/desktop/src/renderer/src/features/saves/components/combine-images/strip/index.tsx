import { IconXmark } from "@pond/icons";
import { Button } from "@pond/ui";
import { useLayoutEffect, useRef, useState } from "react";
import { buildPondUrl, thumbUrlFor } from "@/features/saves/lib/media/url";
import { SpecContextMenu } from "@/shared/components/spec-context-menu";
import { platformGlyphs } from "@/shared/lib/shortcuts";
import type { CombineImage } from "../preview";
import styles from "./styles.module.css";

const THUMB_SIZE = 48;

export function Strip({
  images,
  onReorder,
  onRemove,
}: {
  images: ReadonlyArray<CombineImage>;
  onReorder: (from: number, to: number) => void;
  onRemove: (id: string) => void;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const items = useRef(new Map<string, HTMLDivElement>());
  const refocus = useRef<string | null>(null);
  const reset = () => {
    setDragging(null);
    setOver(null);
  };
  const move = (from: number, to: number) => {
    const image = images[from];
    if (!image || to < 0 || to >= images.length || to === from) {
      return;
    }
    refocus.current = image.save.id;
    onReorder(from, to);
    setAnnouncement(
      `Moved ${image.save.title || "Untitled"} to position ${to + 1} of ${images.length}.`,
    );
  };
  useLayoutEffect(() => {
    const id = refocus.current;
    if (!id) {
      return;
    }
    refocus.current = null;
    items.current.get(id)?.focus();
  });
  return (
    <>
      <ol className={styles.strip} aria-label="Image order">
        {images.map(({ save, file }, index) => {
          const title = save.title || "Untitled";
          return (
            <SpecContextMenu
              key={save.id}
              buildItems={() => [
                {
                  label: "Move Up",
                  shortcut: platformGlyphs(["⌥", "↑"]),
                  disabled: index === 0,
                  onClick: () => move(index, index - 1),
                },
                {
                  label: "Move Down",
                  shortcut: platformGlyphs(["⌥", "↓"]),
                  disabled: index === images.length - 1,
                  onClick: () => move(index, index + 1),
                },
                { type: "separator" },
                { label: "Remove", onClick: () => onRemove(save.id) },
              ]}
            >
              <li
                className={styles.item}
                draggable
                title={title}
                data-dragging={dragging === index || undefined}
                data-over={(over === index && dragging !== index) || undefined}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  setDragging(index);
                }}
                onDragOver={(event) => {
                  if (dragging === null) {
                    return;
                  }
                  event.preventDefault();
                  setOver(index);
                }}
                onDrop={(event) => {
                  if (dragging === null) {
                    return;
                  }
                  event.preventDefault();
                  event.stopPropagation();
                  if (dragging !== index) {
                    onReorder(dragging, index);
                  }
                  reset();
                }}
                onDragEnd={reset}
              >
                <div
                  ref={(node) => {
                    if (node) {
                      items.current.set(save.id, node);
                    } else {
                      items.current.delete(save.id);
                    }
                  }}
                  className={styles.handle}
                  role="button"
                  tabIndex={0}
                  aria-roledescription="sortable"
                  aria-label={`${title}, ${index + 1} of ${images.length}`}
                  aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                  onKeyDown={(event) => {
                    if (!event.altKey) {
                      return;
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      move(index, index - 1);
                    } else if (event.key === "ArrowDown") {
                      event.preventDefault();
                      move(index, index + 1);
                    }
                  }}
                >
                  <img
                    className={styles.thumb}
                    alt=""
                    draggable={false}
                    src={thumbUrlFor(buildPondUrl(save.id, file), THUMB_SIZE)}
                  />
                </div>
                <Button
                  className={styles.remove}
                  icon
                  size="xs"
                  variant="secondary"
                  aria-label={`Remove ${title}`}
                  onClick={() => onRemove(save.id)}
                >
                  <IconXmark size={12} />
                </Button>
              </li>
            </SpecContextMenu>
          );
        })}
      </ol>
      <p role="status" className={styles.announcement}>
        {announcement}
      </p>
    </>
  );
}
