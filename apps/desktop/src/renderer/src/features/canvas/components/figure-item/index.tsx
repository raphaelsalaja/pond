import { cssVars } from "@pond/ui";
import { NodeResizer } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { FIGURE_EDGE, NOTE_FILL } from "../../lib/colors";
import type { FigureNode } from "../../lib/document";
import { drawingOf } from "../../lib/outlines";
import { MIN_SIZE } from "../../lib/transform";
import { useBoard } from "../board/context";
import { EditableText } from "../editable-text";
import { Handles } from "../handles";
import styles from "./styles.module.css";

function fillOf(data: FigureNode["data"]): string {
  switch (data.fill) {
    case "transparent":
      return `color-mix(in srgb, ${NOTE_FILL[data.color]} 35%, transparent)`;
    case "none":
      return "transparent";
    default:
      return NOTE_FILL[data.color];
  }
}

export function FigureItem({
  id,
  data,
  selected,
  draggable,
}: NodeProps<FigureNode>) {
  const board = useBoard();
  const drawing = drawingOf(data.outline);
  return (
    <div className={styles.bounds}>
      <NodeResizer
        isVisible={
          selected && draggable && board.editingId !== id && !data.rotation
        }
        minWidth={MIN_SIZE.figure.width}
        minHeight={MIN_SIZE.figure.height}
        onResizeStart={board.record}
      />
      <Handles onCreate={(side) => board.quickCreate(id, side)} />
      <div
        className={styles.figure}
        data-outline={data.outline}
        data-drawn={drawing ? true : undefined}
        data-selected={selected || undefined}
        data-flip-x={data.flipX || undefined}
        data-flip-y={data.flipY || undefined}
        data-border={data.border}
        style={{
          ...cssVars({
            "--figure-fill": fillOf(data),
            "--figure-edge":
              data.border === "none" ? "transparent" : FIGURE_EDGE[data.color],
          }),
          transform: data.rotation ? `rotate(${data.rotation}deg)` : undefined,
        }}
      >
        {drawing ? (
          <svg
            className={styles.outline}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            <path d={drawing.fill} />
            {drawing.details ? (
              <path className={styles.details} d={drawing.details} />
            ) : null}
          </svg>
        ) : null}
        <EditableText
          id={id}
          text={data.text}
          label="Shape"
          placeholder="Add text"
          hint=""
          variant="figure"
          style={data}
        />
      </div>
    </div>
  );
}
