import { cssVars } from "@pond/ui";
import { NodeResizer } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { FIGURE_EDGE, NOTE_FILL } from "../../lib/colors";
import type { SectionNode } from "../../lib/document";
import { MIN_SIZE } from "../../lib/transform";
import { useBoard } from "../board/context";
import { EditableText } from "../editable-text";
import styles from "./styles.module.css";

export function SectionItem({
  id,
  data,
  selected,
  draggable,
}: NodeProps<SectionNode>) {
  const board = useBoard();
  return (
    <div className={styles.bounds}>
      <NodeResizer
        isVisible={selected && draggable && board.editingId !== id}
        minWidth={MIN_SIZE.section.width}
        minHeight={MIN_SIZE.section.height}
        onResizeStart={board.record}
      />
      <div
        className={styles.section}
        data-selected={selected || undefined}
        style={{
          ...cssVars({
            "--section-fill": NOTE_FILL[data.color],
            "--section-edge": FIGURE_EDGE[data.color],
          }),
        }}
      >
        <div className={styles.title}>
          <EditableText
            id={id}
            text={data.title}
            label="Section Title"
            placeholder="Section"
            hint="Section"
            variant="section"
          />
        </div>
      </div>
    </div>
  );
}
