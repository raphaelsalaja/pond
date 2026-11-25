import { cssVars } from "@pond/ui";
import { NodeResizer } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { NOTE_FILL } from "../../lib/colors";
import type { NoteNode } from "../../lib/document";
import { MIN_SIZE } from "../../lib/transform";
import { useBoard } from "../board/context";
import { EditableText } from "../editable-text";
import { Handles } from "../handles";
import styles from "./styles.module.css";

export function NoteItem({
  id,
  data,
  selected,
  draggable,
}: NodeProps<NoteNode>) {
  const board = useBoard();
  return (
    <div className={styles.bounds}>
      <NodeResizer
        isVisible={
          selected && draggable && board.editingId !== id && !data.rotation
        }
        minWidth={MIN_SIZE.note.width}
        minHeight={MIN_SIZE.note.height}
        onResizeStart={board.record}
      />
      <Handles onCreate={(side) => board.quickCreate(id, side)} />
      <div
        className={styles.note}
        data-selected={selected || undefined}
        style={{
          ...cssVars({ "--note-fill": NOTE_FILL[data.color] }),
          transform: data.rotation ? `rotate(${data.rotation}deg)` : undefined,
        }}
      >
        <EditableText
          id={id}
          text={data.text}
          label="Note"
          placeholder="Write a note"
          hint="Double-click to write"
          variant="note"
          style={data}
          rich
        />
      </div>
    </div>
  );
}
