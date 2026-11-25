import { cssVars, Input } from "@pond/ui";
import { NodeResizer } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { clsx as cn } from "clsx";
import { useEffect, useRef } from "react";
import type { CodeNode } from "../../lib/document";
import { useHighlight } from "../../lib/highlight";
import { languageLabel } from "../../lib/text-style";
import { MIN_SIZE } from "../../lib/transform";
import { useBoard } from "../board/context";
import { Handles } from "../handles";
import styles from "./styles.module.css";

const INDENT = "  ";

export function CodeItem({
  id,
  data,
  selected,
  draggable,
}: NodeProps<CodeNode>) {
  const board = useBoard();
  const editing = board.editingId === id;
  const field = useRef<HTMLTextAreaElement>(null);
  const lines = useHighlight(data.text, data.language, !editing);

  useEffect(() => {
    if (editing) field.current?.focus();
  }, [editing]);

  return (
    <div className={styles.bounds}>
      <NodeResizer
        isVisible={selected && draggable && !editing && !data.rotation}
        minWidth={MIN_SIZE.code.width}
        minHeight={MIN_SIZE.code.height}
        onResizeStart={board.record}
      />
      <Handles />
      <div
        className={styles.code}
        data-selected={selected || undefined}
        data-theme={data.theme}
        style={
          data.rotation
            ? { transform: `rotate(${data.rotation}deg)` }
            : undefined
        }
      >
        <div className={styles.header}>{languageLabel(data.language)}</div>
        {editing ? (
          <Input.Textarea
            ref={field}
            appearance="bare"
            rows={2}
            className={cn(styles.source, "nodrag", "nowheel", "nopan")}
            aria-label="Code"
            placeholder="Write code"
            value={data.text}
            spellCheck={false}
            onChange={(event) => board.setText(id, event.currentTarget.value)}
            onBlur={() => board.finishEditing(id)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape") {
                event.currentTarget.blur();
                return;
              }
              if (event.key !== "Tab") return;
              event.preventDefault();
              const element = event.currentTarget;
              element.setRangeText(
                INDENT,
                element.selectionStart,
                element.selectionEnd,
                "end",
              );
              board.setText(id, element.value);
            }}
          />
        ) : (
          <pre
            className={styles.source}
            data-empty={data.text ? undefined : true}
          >
            {!data.text
              ? "Double-click to write code"
              : lines
                ? lines.map((line, row) => (
                    // oxlint-disable-next-line react/no-array-index-key -- lines have no identity beyond their position
                    <span key={row} className={styles.line}>
                      {line.map((token, column) => (
                        <span
                          // oxlint-disable-next-line react/no-array-index-key -- tokens have no identity beyond their position
                          key={column}
                          className={styles.token}
                          style={cssVars({
                            "--token-light": token.light ?? "inherit",
                            "--token-dark": token.dark ?? "inherit",
                          })}
                        >
                          {token.content}
                        </span>
                      ))}
                    </span>
                  ))
                : data.text}
          </pre>
        )}
      </div>
    </div>
  );
}
