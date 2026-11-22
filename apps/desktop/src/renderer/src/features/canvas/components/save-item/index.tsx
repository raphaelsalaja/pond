import { IconCircleWarning, IconTrash } from "@pond/icons";
import { domainFromUrl } from "@pond/schema/domain";
import { cssVars } from "@pond/ui";
import { type NodeProps, NodeResizer } from "@xyflow/react";
import { useRef, useState } from "react";
import { CardThumb } from "@/features/saves";
import { useSave } from "@/features/saves/pool";
import type { SaveNode } from "../../lib/document";
import { cropOf } from "../../lib/edit";
import { MIN_SIZE } from "../../lib/transform";
import { useBoard } from "../board/context";
import { Handles } from "../handles";
import styles from "./styles.module.css";

export function SaveItem({
  id,
  data,
  selected,
  draggable,
  width,
}: NodeProps<SaveNode>) {
  const board = useBoard();
  const save = useSave(data.saveId);
  const missing = !save && board.savesReady;
  const domain = save?.url ? domainFromUrl(save.url) : null;
  const title = save?.title?.trim() || domain || "Untitled";
  const cropping = board.croppingId === id;
  const media = useRef<HTMLDivElement>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  const fraction = (event: React.PointerEvent) => {
    const bounds = media.current?.getBoundingClientRect();
    if (!bounds?.width || !bounds.height) return null;
    return {
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
    };
  };

  return (
    <div className={styles.bounds}>
      <NodeResizer
        isVisible={selected && draggable && !cropping && !data.rotation}
        minWidth={MIN_SIZE.save.width}
        minHeight={MIN_SIZE.save.height}
        onResizeStart={board.record}
      />
      <Handles />
      <div
        className={styles.card}
        data-selected={selected || undefined}
        data-missing={missing || undefined}
        data-trashed={save?.deletedAt ? true : undefined}
        style={
          data.rotation
            ? { transform: `rotate(${data.rotation}deg)` }
            : undefined
        }
      >
        <div ref={media} className={styles.media}>
          {save ? (
            <div
              className={styles.window}
              style={
                data.crop && !cropping
                  ? cssVars({
                      "--crop-x": data.crop.x,
                      "--crop-y": data.crop.y,
                      "--crop-width": data.crop.width,
                      "--crop-height": data.crop.height,
                    })
                  : undefined
              }
            >
              <CardThumb
                save={save}
                view="grid"
                width={Math.round(width ?? 240)}
              />
            </div>
          ) : missing ? (
            <span className={styles.status}>
              <IconCircleWarning size={18} />
              Not in this library
            </span>
          ) : null}
          {cropping ? (
            <div
              className={`${styles.shade} nodrag nowheel nopan`}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                const point = fraction(event);
                if (!point) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                event.stopPropagation();
                origin.current = point;
                setDraft({ x: point.x, y: point.y, width: 0, height: 0 });
              }}
              onPointerMove={(event) => {
                const start = origin.current;
                const point = fraction(event);
                if (!start || !point) return;
                setDraft({
                  x: Math.min(start.x, point.x),
                  y: Math.min(start.y, point.y),
                  width: Math.abs(point.x - start.x),
                  height: Math.abs(point.y - start.y),
                });
              }}
              onPointerUp={(event) => {
                const start = origin.current;
                const point = fraction(event);
                origin.current = null;
                setDraft(null);
                if (!start || !point) return;
                board.setCrop(id, cropOf(start, point));
              }}
            >
              {draft ? (
                <div
                  className={styles.rect}
                  style={{
                    left: `${draft.x * 100}%`,
                    top: `${draft.y * 100}%`,
                    width: `${draft.width * 100}%`,
                    height: `${draft.height * 100}%`,
                  }}
                />
              ) : null}
            </div>
          ) : null}
        </div>
        <div className={styles.caption}>
          <span className={styles.title}>
            {missing ? "Missing Save" : title}
          </span>
          {save?.deletedAt ? (
            <span className={styles.meta}>
              <IconTrash size={12} />
              In Trash
            </span>
          ) : domain && domain !== title ? (
            <span className={styles.meta}>{domain}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
