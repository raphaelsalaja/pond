import { cssVars } from "@pond/ui";
import { NodeResizer } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { FIGURE_EDGE, NOTE_FILL } from "../../lib/colors";
import type { TopicNode } from "../../lib/document";
import { MIN_SIZE } from "../../lib/transform";
import { useBoard } from "../board/context";
import { EditableText } from "../editable-text";
import { Handles } from "../handles";
import styles from "./styles.module.css";

export function TopicItem({
  id,
  data,
  selected,
  draggable,
}: NodeProps<TopicNode>) {
  const board = useBoard();
  return (
    <div className={styles.bounds}>
      <NodeResizer
        isVisible={
          selected && draggable && board.editingId !== id && !data.rotation
        }
        minWidth={MIN_SIZE.topic.width}
        minHeight={MIN_SIZE.topic.height}
        onResizeStart={board.record}
      />
      <Handles onCreate={(side) => board.quickCreate(id, side)} />
      <div
        className={styles.topic}
        data-selected={selected || undefined}
        style={{
          ...cssVars({
            "--topic-fill": NOTE_FILL[data.color],
            "--topic-edge": FIGURE_EDGE[data.color],
          }),
          transform: data.rotation ? `rotate(${data.rotation}deg)` : undefined,
        }}
      >
        <EditableText
          id={id}
          text={data.text}
          label="Topic"
          placeholder="Topic"
          hint="Double-click to name"
          variant="topic"
          style={data}
        />
      </div>
    </div>
  );
}
